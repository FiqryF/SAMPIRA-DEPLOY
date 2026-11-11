package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
	"ecorecycle/internal/repositories"
)

const facilityReportsPath = "/api/ecorecycle/facility-reports"

func (a *App) RegisterFacilityReports(mux *http.ServeMux) {
	mux.HandleFunc("POST "+facilityReportsPath, a.createFacilityReport)
	mux.HandleFunc("GET "+facilityReportsPath, a.listFacilityReports)
	mux.HandleFunc("GET "+facilityReportsPath+"/{id}", a.facilityDetail)
	mux.HandleFunc("PUT "+facilityReportsPath+"/{id}", a.reviseFacilityReport)
	mux.HandleFunc("GET "+facilityReportsPath+"/{id}/history", a.facilityHistory)
	mux.HandleFunc("GET "+facilityReportsPath+"/{id}/photo", a.facilityPhoto)
	mux.HandleFunc("POST "+facilityReportsPath+"/{id}/verification", a.verifyFacilityReport)
}

func (a *App) facilitySession(w http.ResponseWriter, r *http.Request, allowedRole string) *models.TokenPayload {
	session, err := a.apiSession(r)
	if err != nil {
		(&apiProblem{err.Error(), http.StatusUnauthorized}).write(w)
		return nil
	}
	if (session.Role != models.RoleUser && session.Role != models.RoleAdmin) ||
		(allowedRole != "" && session.Role != allowedRole) {
		(&apiProblem{"Akses laporan fasilitas ditolak.", http.StatusForbidden}).write(w)
		return nil
	}
	return session
}

func facilityOwner(session *models.TokenPayload) int {
	if session.Role == models.RoleUser {
		return session.ID
	}
	return 0
}

func positiveFacilityNumber(value string) (int, bool) {
	number, err := strconv.ParseInt(value, 10, 32)
	return int(number), err == nil && number > 0
}

func facilityID(w http.ResponseWriter, r *http.Request) int {
	id, valid := positiveFacilityNumber(r.PathValue("id"))
	if !valid {
		(&apiProblem{"ID laporan tidak valid.", http.StatusBadRequest}).write(w)
		return 0
	}
	return id
}

func facilityFailure(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		(&apiProblem{"Laporan atau foto tidak ditemukan.", http.StatusNotFound}).write(w)
	case errors.Is(err, repositories.ErrFacilityConflict):
		(&apiProblem{"Versi atau status laporan sudah berubah. Muat ulang detail laporan.", http.StatusConflict}).write(w)
	default:
		(&apiProblem{"Data laporan fasilitas tidak dapat diproses.", http.StatusInternalServerError}).write(w)
	}
}

func attachFacilityPhotoURL(report *models.FacilityReport) {
	if report.HasPhoto {
		path := fmt.Sprintf("%s/%d/photo", facilityReportsPath, report.ID)
		report.PhotoURL = &path
	}
}

func facilityReportResponse(w http.ResponseWriter, message string, report models.FacilityReport, code int) {
	attachFacilityPhotoURL(&report)
	httpx.SendResponse(w, "success", message, report, code)
}

func (a *App) createFacilityReport(w http.ResponseWriter, r *http.Request) {
	session := a.facilitySession(w, r, models.RoleUser)
	if session == nil {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if len(r.Header.Values("Idempotency-Key")) != 1 || !facilityRequestKey.MatchString(key) {
		(&apiProblem{"Idempotency-Key UUID v4 wajib diisi.", http.StatusBadRequest}).write(w)
		return
	}
	input, _, problem := readFacilityForm(w, r, false)
	if problem != nil {
		problem.write(w)
		return
	}
	report, created, err := a.FacilityReports.Create(r.Context(), session.ID, key, input)
	if err != nil {
		facilityFailure(w, err)
		return
	}
	if created {
		w.Header().Set("Location", fmt.Sprintf("%s/%d", facilityReportsPath, report.ID))
		facilityReportResponse(w, "Laporan fasilitas dibuat.", report, http.StatusCreated)
		return
	}
	facilityReportResponse(w, "Pengajuan ini sudah tercatat.", report, http.StatusOK)
}

func (a *App) reviseFacilityReport(w http.ResponseWriter, r *http.Request) {
	session := a.facilitySession(w, r, models.RoleUser)
	if session == nil {
		return
	}
	id := facilityID(w, r)
	if id == 0 {
		return
	}
	input, version, problem := readFacilityForm(w, r, true)
	if problem != nil {
		problem.write(w)
		return
	}
	report, err := a.FacilityReports.Revise(r.Context(), id, session.ID, version, input)
	if err != nil {
		facilityFailure(w, err)
		return
	}
	facilityReportResponse(w, "Revisi laporan dikirim.", report, http.StatusOK)
}

func (a *App) verifyFacilityReport(w http.ResponseWriter, r *http.Request) {
	session := a.facilitySession(w, r, models.RoleAdmin)
	if session == nil {
		return
	}
	id := facilityID(w, r)
	if id == 0 {
		return
	}
	input, problem := readFacilityVerification(w, r)
	if problem != nil {
		problem.write(w)
		return
	}
	report, err := a.FacilityReports.Verify(r.Context(), id, session.ID, input.Version, input.Status, input.Note)
	if err != nil {
		facilityFailure(w, err)
		return
	}
	facilityReportResponse(w, "Verifikasi laporan tercatat.", report, http.StatusOK)
}

func (a *App) facilityDetail(w http.ResponseWriter, r *http.Request) {
	session := a.facilitySession(w, r, "")
	if session == nil {
		return
	}
	id := facilityID(w, r)
	if id == 0 {
		return
	}
	report, err := a.FacilityReports.Detail(r.Context(), id, facilityOwner(session))
	if err != nil {
		facilityFailure(w, err)
		return
	}
	facilityReportResponse(w, "Detail laporan fasilitas.", report, http.StatusOK)
}

func (a *App) facilityPhoto(w http.ResponseWriter, r *http.Request) {
	session := a.facilitySession(w, r, "")
	if session == nil {
		return
	}
	id := facilityID(w, r)
	if id == 0 {
		return
	}
	photo, mediaType, err := a.FacilityReports.Photo(r.Context(), id, facilityOwner(session))
	if err != nil {
		facilityFailure(w, err)
		return
	}
	writeFacilityPhoto(w, photo, mediaType)
}

func writeFacilityPhoto(w http.ResponseWriter, photo []byte, mediaType string) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("Content-Type", mediaType)
	w.Write(photo)
}

func facilityPage(rawQuery, cursorField string, allowedFilters ...string) (url.Values, int, int, bool) {
	query, err := url.ParseQuery(rawQuery)
	if err != nil {
		return nil, 0, 0, false
	}
	allowed := map[string]bool{"limit": true, cursorField: true}
	for _, filter := range allowedFilters {
		allowed[filter] = true
	}
	for key, values := range query {
		if !allowed[key] || len(values) != 1 || values[0] == "" {
			return nil, 0, 0, false
		}
	}
	limit, cursor := 20, 0
	if query.Has("limit") {
		var valid bool
		limit, valid = positiveFacilityNumber(query.Get("limit"))
		if !valid || limit > 100 {
			return nil, 0, 0, false
		}
	}
	if query.Has(cursorField) {
		var valid bool
		cursor, valid = positiveFacilityNumber(query.Get(cursorField))
		if !valid {
			return nil, 0, 0, false
		}
	}
	return query, cursor, limit, true
}

func (a *App) listFacilityReports(w http.ResponseWriter, r *http.Request) {
	session := a.facilitySession(w, r, "")
	if session == nil {
		return
	}
	query, cursor, limit, valid := facilityPage(r.URL.RawQuery, "before_id", "status", "category")
	status, category := query.Get("status"), query.Get("category")
	if !valid || (status != "" && !models.ValidFacilityStatus(status)) ||
		(category != "" && !models.ValidFacilityCategory(category)) {
		(&apiProblem{"Filter atau cursor laporan tidak valid.", http.StatusBadRequest}).write(w)
		return
	}
	reports, err := a.FacilityReports.List(r.Context(), facilityOwner(session), cursor, limit+1, status, category)
	if err != nil {
		facilityFailure(w, err)
		return
	}
	var next *int
	if len(reports) > limit {
		reports = reports[:limit]
		next = &reports[limit-1].ID
	}
	for i := range reports {
		attachFacilityPhotoURL(&reports[i])
	}
	httpx.SendResponse(w, "success", "Daftar laporan fasilitas.", map[string]any{"items": reports, "next_before_id": next}, http.StatusOK)
}

func (a *App) facilityHistory(w http.ResponseWriter, r *http.Request) {
	session := a.facilitySession(w, r, "")
	if session == nil {
		return
	}
	id := facilityID(w, r)
	if id == 0 {
		return
	}
	_, cursor, limit, valid := facilityPage(r.URL.RawQuery, "before_version")
	if !valid {
		(&apiProblem{"Cursor histori tidak valid.", http.StatusBadRequest}).write(w)
		return
	}
	history, err := a.FacilityReports.History(r.Context(), id, facilityOwner(session), cursor, limit+1)
	if err != nil {
		facilityFailure(w, err)
		return
	}
	var next *int
	if len(history) > limit {
		history = history[:limit]
		next = &history[limit-1].Version
	}
	httpx.SendResponse(w, "success", "Histori laporan fasilitas.", map[string]any{"items": history, "next_before_version": next}, http.StatusOK)
}
