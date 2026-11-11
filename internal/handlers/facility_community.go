package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
)

// The list stays minimal. Community detail shares facility content only;
// reporter identity, private review notes and internal evidence remain protected.
type communityFacility struct {
	ID         int       `json:"id"`
	Tracking   string    `json:"tracking_number"`
	Category   string    `json:"category"`
	Title      string    `json:"title"`
	Address    string    `json:"address"`
	Status     string    `json:"status"`
	Handling   string    `json:"handling_status"`
	Affected   int       `json:"affected_count"`
	Mine       bool      `json:"is_mine"`
	Confirmed  bool      `json:"confirmed_by_me"`
	CanConfirm bool      `json:"can_confirm"`
	Created    time.Time `json:"created_at"`
}

func (a *App) communityFacilityReports(w http.ResponseWriter, r *http.Request) {
	actor := a.facilitySession(w, r, models.RoleUser)
	if actor == nil {
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	q := r.URL.Query()
	before := 0
	if q.Get("before_id") != "" {
		var ok bool
		before, ok = positiveFacilityNumber(q.Get("before_id"))
		if !ok {
			(&apiProblem{"Cursor laporan tidak valid.", 400}).write(w)
			return
		}
	}
	search := strings.TrimSpace(q.Get("q"))
	category := q.Get("category")
	if len(search) > 100 || (category != "" && !models.ValidFacilityCategory(category)) {
		(&apiProblem{"Pencarian atau kategori tidak valid.", 400}).write(w)
		return
	}
	rows, err := a.DB.QueryContext(r.Context(), `SELECT r.id,r.tracking_number,r.category,r.title,r.address,r.status,COALESCE(h.status,''),
 1+(SELECT COUNT(*) FROM facility_report_affected af WHERE af.report_id=r.id),r.reporter_id=?,
 (r.reporter_id=? OR EXISTS(SELECT 1 FROM facility_report_affected af WHERE af.report_id=r.id AND af.user_id=?)),r.created_at
 FROM facility_reports r LEFT JOIN facility_handling h ON h.report_id=r.id
 WHERE r.status IN ('pending','approved') AND (?=0 OR r.id<?) AND (?='' OR r.category=?)
 AND (?='' OR r.title LIKE ? OR r.address LIKE ? OR r.tracking_number LIKE ?)
 ORDER BY r.id DESC LIMIT 21`, actor.ID, actor.ID, actor.ID, before, before, category, category, search, "%"+search+"%", "%"+search+"%", "%"+search+"%")
	if err != nil {
		facilityFailure(w, err)
		return
	}
	defer rows.Close()
	items := make([]communityFacility, 0, 21)
	for rows.Next() {
		var item communityFacility
		if err = rows.Scan(&item.ID, &item.Tracking, &item.Category, &item.Title, &item.Address, &item.Status, &item.Handling, &item.Affected, &item.Mine, &item.Confirmed, &item.Created); err != nil {
			facilityFailure(w, err)
			return
		}
		item.CanConfirm = !item.Confirmed && item.Handling != "completed"
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		facilityFailure(w, err)
		return
	}
	var next *int
	if len(items) > 20 {
		items = items[:20]
		id := items[19].ID
		next = &id
	}
	httpx.SendResponse(w, "success", "Laporan fasilitas warga.", map[string]any{"items": items, "next_before_id": next, "count_includes_reporter": true}, 200)
}

func (a *App) confirmFacilityAffected(w http.ResponseWriter, r *http.Request) {
	actor := a.facilitySession(w, r, models.RoleUser)
	if actor == nil {
		return
	}
	id := facilityID(w, r)
	if id == 0 {
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	tx, err := a.DB.BeginTx(r.Context(), nil)
	if err != nil {
		facilityFailure(w, err)
		return
	}
	defer tx.Rollback()
	var reporter int
	var status, handling string
	err = tx.QueryRowContext(r.Context(), `SELECT r.reporter_id,r.status,COALESCE(h.status,'') FROM facility_reports r
 LEFT JOIN facility_handling h ON h.report_id=r.id WHERE r.id=? FOR UPDATE`, id).Scan(&reporter, &status, &handling)
	if err != nil {
		facilityFailure(w, err)
		return
	}
	if status != "pending" && status != "approved" {
		facilityFailure(w, sql.ErrNoRows)
		return
	}
	var existing bool
	if err = tx.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM facility_report_affected WHERE report_id=? AND user_id=?)", id, actor.ID).Scan(&existing); err != nil {
		facilityFailure(w, err)
		return
	}
	// A retry remains successful after closure; a new confirmation cannot reopen work.
	if !existing && reporter != actor.ID && handling == "completed" {
		(&apiProblem{"Laporan sudah selesai ditangani. Konfirmasi baru tidak tersedia.", 409}).write(w)
		return
	}
	if reporter != actor.ID && !existing {
		if _, err = tx.ExecContext(r.Context(), "INSERT INTO facility_report_affected (report_id,user_id,confirmed_at) VALUES (?,?,UTC_TIMESTAMP(6))", id, actor.ID); err != nil {
			facilityFailure(w, err)
			return
		}
	}
	var count int
	if err = tx.QueryRowContext(r.Context(), "SELECT 1+COUNT(*) FROM facility_report_affected WHERE report_id=?", id).Scan(&count); err != nil {
		facilityFailure(w, err)
		return
	}
	if err = tx.Commit(); err != nil {
		facilityFailure(w, err)
		return
	}
	httpx.SendResponse(w, "success", "Konfirmasi terdampak tercatat.", map[string]any{"report_id": id, "affected_count": count, "confirmed_by_me": true, "count_includes_reporter": true}, 200)
}

type communityFacilityDetail struct {
	communityFacility
	Description  string    `json:"description"`
	Latitude     *float64  `json:"latitude"`
	Longitude    *float64  `json:"longitude"`
	PhotoURL     *string   `json:"photo_url"`
	PublicResult *string   `json:"public_result"`
	Updated      time.Time `json:"updated_at"`
}

func (a *App) communityFacilityDetail(w http.ResponseWriter, r *http.Request) {
	actor := a.facilitySession(w, r, models.RoleUser)
	if actor == nil {
		return
	}
	id := facilityID(w, r)
	if id == 0 {
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	var item communityFacilityDetail
	var hasPhoto bool
	err := a.DB.QueryRowContext(r.Context(), `SELECT r.id,r.tracking_number,r.category,r.title,r.address,r.status,COALESCE(h.status,''),
 1+(SELECT COUNT(*) FROM facility_report_affected af WHERE af.report_id=r.id),r.reporter_id=?,
 (r.reporter_id=? OR EXISTS(SELECT 1 FROM facility_report_affected af WHERE af.report_id=r.id AND af.user_id=?)),r.created_at,
 r.description,r.latitude,r.longitude,EXISTS(SELECT 1 FROM facility_report_photos p WHERE p.report_id=r.id),
 CASE WHEN r.status='approved' AND h.status='completed' THEN h.public_result END,r.updated_at
 FROM facility_reports r LEFT JOIN facility_handling h ON h.report_id=r.id
 WHERE r.id=? AND r.status IN ('pending','approved')`, actor.ID, actor.ID, actor.ID, id).Scan(
		&item.ID, &item.Tracking, &item.Category, &item.Title, &item.Address, &item.Status, &item.Handling, &item.Affected, &item.Mine, &item.Confirmed, &item.Created,
		&item.Description, &item.Latitude, &item.Longitude, &hasPhoto, &item.PublicResult, &item.Updated)
	if err != nil {
		facilityFailure(w, err)
		return
	}
	item.CanConfirm = !item.Confirmed && item.Handling != "completed"
	if hasPhoto {
		path := facilityReportsPath + "/community/photo/" + strconv.Itoa(id)
		item.PhotoURL = &path
	}
	httpx.SendResponse(w, "success", "Detail laporan fasilitas warga.", item, 200)
}

func (a *App) communityFacilityPhoto(w http.ResponseWriter, r *http.Request) {
	if a.facilitySession(w, r, models.RoleUser) == nil {
		return
	}
	id := facilityID(w, r)
	if id == 0 {
		return
	}
	var content []byte
	var mediaType string
	err := a.DB.QueryRowContext(r.Context(), `SELECT p.content,p.content_type FROM facility_report_photos p
 JOIN facility_reports r ON r.id=p.report_id WHERE r.id=? AND r.status IN ('pending','approved')`, id).Scan(&content, &mediaType)
	if err != nil {
		facilityFailure(w, err)
		return
	}
	writeFacilityPhoto(w, content, mediaType)
}
