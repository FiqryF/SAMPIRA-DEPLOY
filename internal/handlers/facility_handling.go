package handlers

import (
	"errors"
	"net/http"
	"slices"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
	"ecorecycle/internal/repositories"
	"github.com/go-sql-driver/mysql"
)

const facilityHandlingPath = facilityReportsPath + "/{id}/handling"

func (a *App) RegisterFacilityHandling(mux *http.ServeMux) {
	mux.HandleFunc("GET "+facilityReportsPath+"/handling", a.handlingList)
	mux.HandleFunc("GET "+facilityReportsPath+"/handling/officers", a.handlingOfficers)
	mux.HandleFunc("GET "+facilityHandlingPath, a.handlingDetail)
	mux.HandleFunc("GET "+facilityHandlingPath+"/history", a.handlingHistory)
	mux.HandleFunc("GET "+facilityHandlingPath+"/history/{version}/photo", a.handlingPhoto)
	mux.HandleFunc("POST "+facilityHandlingPath+"/assignment", a.handlingMutation(models.RoleAdmin, readHandlingAssignment))
	mux.HandleFunc("POST "+facilityHandlingPath+"/activity", a.handlingMutation(models.RolePetugas, readHandlingActivity))
	mux.HandleFunc("POST "+facilityHandlingPath+"/review", a.handlingMutation(models.RoleAdmin, readHandlingReview))
	mux.HandleFunc("POST "+facilityHandlingPath+"/coordination", a.handlingMutation(models.RoleAdmin, readHandlingCoordination))
}

func (a *App) handlingSession(w http.ResponseWriter, r *http.Request, roles ...string) *models.TokenPayload {
	actor, err := a.apiSession(r)
	if err != nil {
		(&apiProblem{err.Error(), http.StatusUnauthorized}).write(w)
		return nil
	}
	if !slices.Contains(roles, actor.Role) {
		(&apiProblem{"Akses penanganan fasilitas ditolak.", http.StatusForbidden}).write(w)
		return nil
	}
	return actor
}

func handlingFailure(w http.ResponseWriter, err error) {
	var dbError *mysql.MySQLError
	switch {
	case errors.Is(err, repositories.ErrHandlingPhotoSize):
		(&apiProblem{"Foto melebihi kapasitas penyimpanan. Gunakan foto lebih kecil atau muat ulang halaman agar foto dioptimalkan sebelum dikirim.", http.StatusRequestEntityTooLarge}).write(w)
	case errors.Is(err, repositories.ErrHandlingRole):
		(&apiProblem{"Akses penanganan fasilitas ditolak.", http.StatusForbidden}).write(w)
	case errors.Is(err, repositories.ErrHandlingOfficer):
		(&apiProblem{"Pilih Petugas aktif yang tersedia.", http.StatusConflict}).write(w)
	case errors.Is(err, repositories.ErrHandlingEvidence):
		(&apiProblem{"Bukti harus berasal dari aktivitas pada assignment yang menyampaikan hasil.", http.StatusConflict}).write(w)
	case errors.As(err, &dbError) && (dbError.Number == 1205 || dbError.Number == 1213):
		facilityFailure(w, repositories.ErrFacilityConflict)
	default:
		facilityFailure(w, err)
	}
}

func (a *App) handlingMutation(role string, parse func(http.ResponseWriter, *http.Request) (models.HandlingCommand, *apiProblem)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		actor := a.handlingSession(w, r, role)
		if actor == nil {
			return
		}
		id := facilityID(w, r)
		if id == 0 {
			return
		}
		cmd, problem := parse(w, r)
		if problem != nil {
			problem.write(w)
			return
		}
		report, err := a.FacilityHandling.Apply(r.Context(), id, *actor, cmd)
		if err != nil {
			handlingFailure(w, err)
			return
		}
		httpx.SendResponse(w, "success", "Aktivitas penanganan tercatat.", report, http.StatusOK)
	}
}

func (a *App) handlingList(w http.ResponseWriter, r *http.Request) {
	actor := a.handlingSession(w, r, models.RoleAdmin, models.RolePetugas)
	if actor == nil {
		return
	}
	query, cursor, limit, valid := facilityPage(r.URL.RawQuery, "before_id", "status", "category")
	status, category := query.Get("status"), query.Get("category")
	if !valid || (status != "" && !models.ValidHandlingStatus(status)) || (category != "" && !models.ValidFacilityCategory(category)) {
		handlingBadRequest("Filter atau cursor penanganan tidak valid.").write(w)
		return
	}
	rows, err := a.FacilityHandling.List(r.Context(), *actor, cursor, limit+1, status, category)
	if err != nil {
		handlingFailure(w, err)
		return
	}
	sendHandlingPage(w, rows, limit, "next_before_id", func(row models.FacilityHandlingSummary) int { return row.ReportID })
}

func (a *App) handlingOfficers(w http.ResponseWriter, r *http.Request) {
	if a.handlingSession(w, r, models.RoleAdmin) == nil {
		return
	}
	_, cursor, limit, valid := facilityPage(r.URL.RawQuery, "before_id")
	if !valid {
		handlingBadRequest("Cursor Petugas tidak valid.").write(w)
		return
	}
	rows, err := a.FacilityHandling.Officers(r.Context(), cursor, limit+1)
	if err != nil {
		handlingFailure(w, err)
		return
	}
	sendHandlingPage(w, rows, limit, "next_before_id", func(row models.HandlingOfficer) int { return row.ID })
}

func (a *App) handlingDetail(w http.ResponseWriter, r *http.Request) {
	actor := a.handlingSession(w, r, models.RoleAdmin, models.RoleUser, models.RolePetugas)
	if actor == nil {
		return
	}
	id := facilityID(w, r)
	if id == 0 {
		return
	}
	report, err := a.FacilityHandling.Detail(r.Context(), *actor, id)
	if err != nil {
		handlingFailure(w, err)
		return
	}
	httpx.SendResponse(w, "success", "Penanganan fasilitas.", report, http.StatusOK)
}

func (a *App) handlingHistory(w http.ResponseWriter, r *http.Request) {
	actor := a.handlingSession(w, r, models.RoleAdmin, models.RoleUser, models.RolePetugas)
	if actor == nil {
		return
	}
	id := facilityID(w, r)
	if id == 0 {
		return
	}
	_, cursor, limit, valid := facilityPage(r.URL.RawQuery, "before_version")
	if !valid {
		handlingBadRequest("Cursor histori tidak valid.").write(w)
		return
	}
	rows, err := a.FacilityHandling.History(r.Context(), *actor, id, cursor, limit+1)
	if err != nil {
		handlingFailure(w, err)
		return
	}
	sendHandlingPage(w, rows, limit, "next_before_version", func(row models.FacilityHandlingEvent) int { return row.Version })
}

func sendHandlingPage[T any](w http.ResponseWriter, rows []T, limit int, cursor string, key func(T) int) {
	var next *int
	if len(rows) > limit {
		rows = rows[:limit]
		id := key(rows[limit-1])
		next = &id
	}
	httpx.SendResponse(w, "success", "Daftar penanganan fasilitas.", map[string]any{"items": rows, cursor: next}, http.StatusOK)
}

func (a *App) handlingPhoto(w http.ResponseWriter, r *http.Request) {
	actor := a.handlingSession(w, r, models.RoleAdmin, models.RoleUser, models.RolePetugas)
	if actor == nil {
		return
	}
	id := facilityID(w, r)
	if id == 0 {
		return
	}
	version, valid := positiveFacilityNumber(r.PathValue("version"))
	if !valid {
		handlingBadRequest("Versi bukti tidak valid.").write(w)
		return
	}
	photo, mediaType, err := a.FacilityHandling.Photo(r.Context(), *actor, id, version)
	if err != nil {
		handlingFailure(w, err)
		return
	}
	writeFacilityPhoto(w, photo, mediaType)
}
