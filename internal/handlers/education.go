package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
	"ecorecycle/internal/repositories"

	"github.com/go-sql-driver/mysql"
)

const educationPath = "/api/ecorecycle/education/articles"
const educationManagePath = "/api/ecorecycle/education/manage/articles"

func (a *App) RegisterEducation(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/ecorecycle/education/manage/photos", a.educationPhotoConfig)
	mux.HandleFunc("POST "+educationManagePath+"/{id}/photos", a.educationSavePhotos)
	mux.HandleFunc("GET /api/ecorecycle/education/media/{id}/{slot}", a.educationPhoto)
	mux.HandleFunc("GET "+educationPath, func(w http.ResponseWriter, r *http.Request) { a.educationList(w, r, false) })
	mux.HandleFunc("GET "+educationPath+"/{slug}", a.educationPublicDetail)
	mux.HandleFunc("GET "+educationManagePath, func(w http.ResponseWriter, r *http.Request) { a.educationList(w, r, true) })
	mux.HandleFunc("POST "+educationManagePath, a.educationCreate)
	mux.HandleFunc("GET "+educationManagePath+"/{id}", a.educationManagedDetail)
	mux.HandleFunc("PUT "+educationManagePath+"/{id}", a.educationEdit)
	mux.HandleFunc("POST "+educationManagePath+"/{id}/publication", a.educationPublication)
}

func (a *App) educationAdmin(w http.ResponseWriter, r *http.Request) *models.TokenPayload {
	session, err := a.apiSession(r)
	if err != nil {
		(&apiProblem{err.Error(), http.StatusUnauthorized}).write(w)
		return nil
	}
	if session.Role != models.RoleAdmin {
		(&apiProblem{"Pengelolaan artikel hanya untuk Admin.", http.StatusForbidden}).write(w)
		return nil
	}
	return session
}

func educationFailure(w http.ResponseWriter, err error) {
	var mysqlError *mysql.MySQLError
	switch {
	case errors.Is(err, sql.ErrNoRows):
		(&apiProblem{"Artikel edukasi tidak ditemukan.", http.StatusNotFound}).write(w)
	case errors.Is(err, repositories.ErrEducationConflict):
		(&apiProblem{"Versi atau status artikel berubah. Muat ulang detail artikel.", http.StatusConflict}).write(w)
	case errors.As(err, &mysqlError) && mysqlError.Number == 1062:
		(&apiProblem{"Slug artikel sudah digunakan.", http.StatusConflict}).write(w)
	default:
		(&apiProblem{"Artikel edukasi tidak dapat diproses.", http.StatusInternalServerError}).write(w)
	}
}

func educationID(w http.ResponseWriter, r *http.Request) int {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 32)
	if err != nil || id < 1 {
		(&apiProblem{"ID artikel tidak valid.", http.StatusBadRequest}).write(w)
		return 0
	}
	return int(id)
}

func (a *App) educationList(w http.ResponseWriter, r *http.Request, managed bool) {
	if managed && a.educationAdmin(w, r) == nil {
		return
	}
	filter, valid := readEducationFilter(r.URL.RawQuery, managed)
	if !valid {
		(&apiProblem{"Filter atau pagination artikel tidak valid.", http.StatusBadRequest}).write(w)
		return
	}
	var items any
	var more bool
	var err error
	if managed {
		items, more, err = a.Education.ListManaged(r.Context(), filter)
	} else {
		items, more, err = a.Education.ListPublished(r.Context(), filter)
	}
	if err != nil {
		educationFailure(w, err)
		return
	}
	var nextPage *int
	if more && filter.Page < educationMaxPage {
		next := filter.Page + 1
		nextPage = &next
	}
	httpx.SendResponse(w, "success", "Daftar artikel edukasi.", map[string]any{
		"items": items, "page": filter.Page, "limit": filter.Limit,
		"next_page": nextPage, "categories": models.EducationCategories(),
	}, http.StatusOK)
}

func (a *App) educationPublicDetail(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if !validEducationSlug(slug) {
		educationFailure(w, sql.ErrNoRows)
		return
	}
	item, err := a.Education.Published(r.Context(), slug)
	if err != nil {
		educationFailure(w, err)
		return
	}
	httpx.SendResponse(w, "success", "Detail artikel edukasi.", item, http.StatusOK)
}

func (a *App) educationManagedDetail(w http.ResponseWriter, r *http.Request) {
	if a.educationAdmin(w, r) == nil {
		return
	}
	id := educationID(w, r)
	if id == 0 {
		return
	}
	item, err := a.Education.Managed(r.Context(), id)
	if err != nil {
		educationFailure(w, err)
		return
	}
	httpx.SendResponse(w, "success", "Detail pengelolaan artikel.", item, http.StatusOK)
}

func (a *App) educationCreate(w http.ResponseWriter, r *http.Request) {
	session := a.educationAdmin(w, r)
	if session == nil {
		return
	}
	var input models.EducationInput
	if problem := readEducationJSON(w, r, &input); problem != nil {
		problem.write(w)
		return
	}
	if problem := validateEducationInput(&input); problem != nil {
		problem.write(w)
		return
	}
	item, err := a.Education.Create(r.Context(), input, session.ID)
	if err != nil {
		educationFailure(w, err)
		return
	}
	w.Header().Set("Location", educationManagePath+"/"+strconv.Itoa(item.ID))
	httpx.SendResponse(w, "success", "Draft artikel dibuat.", item, http.StatusCreated)
}

func (a *App) educationEdit(w http.ResponseWriter, r *http.Request) {
	session := a.educationAdmin(w, r)
	if session == nil {
		return
	}
	id := educationID(w, r)
	if id == 0 {
		return
	}
	var input struct {
		models.EducationInput
		Version int `json:"version"`
	}
	if problem := readEducationJSON(w, r, &input); problem != nil {
		problem.write(w)
		return
	}
	if input.Version < 1 || input.Version > educationMaxVersion {
		(&apiProblem{"Versi artikel wajib valid.", http.StatusBadRequest}).write(w)
		return
	}
	if problem := validateEducationInput(&input.EducationInput); problem != nil {
		problem.write(w)
		return
	}
	item, err := a.Education.Edit(r.Context(), id, input.Version, session.ID, input.EducationInput)
	if err != nil {
		educationFailure(w, err)
		return
	}
	httpx.SendResponse(w, "success", "Draft artikel diperbarui.", item, http.StatusOK)
}

func (a *App) educationPublication(w http.ResponseWriter, r *http.Request) {
	session := a.educationAdmin(w, r)
	if session == nil {
		return
	}
	id := educationID(w, r)
	if id == 0 {
		return
	}
	var input struct {
		Version int    `json:"version"`
		Status  string `json:"status"`
	}
	if problem := readEducationJSON(w, r, &input); problem != nil {
		problem.write(w)
		return
	}
	if input.Version < 1 || input.Version > educationMaxVersion ||
		(input.Status != models.EducationPublished && input.Status != models.EducationArchived) {
		(&apiProblem{"Versi atau status publikasi tidak valid.", http.StatusBadRequest}).write(w)
		return
	}
	item, err := a.Education.SetPublication(r.Context(), id, input.Version, session.ID, input.Status)
	if err != nil {
		educationFailure(w, err)
		return
	}
	httpx.SendResponse(w, "success", "Status publikasi artikel diperbarui.", item, http.StatusOK)
}
