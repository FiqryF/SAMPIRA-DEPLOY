package handlers

import (
	"database/sql"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ecorecycle/internal/models"
)

func (a *App) roleAnalytics(w http.ResponseWriter, r *http.Request) {
	actor := a.contributionActor(w, r, models.RoleUser, models.RolePetugas, models.RoleAdmin, models.RoleAdministrator)
	if actor == nil {
		return
	}
	if len(r.URL.Query()) != 0 {
		(&apiProblem{"Statistik menggunakan cakupan sesi, tanpa parameter user_id.", 400}).write(w)
		return
	}
	data := map[string]any{"role": actor.Role}
	ctx := r.Context()
	// Each aggregate is scoped in SQL. Never return pickup addresses or coordinates.
	queries := map[string]string{}
	args := []any{}
	switch actor.Role {
	case models.RoleUser:
		args = []any{actor.ID}
		queries = map[string]string{
			"pickups":            "SELECT COUNT(*) FROM pickups WHERE user_id=?",
			"completed_pickups":  "SELECT COUNT(*) FROM pickups WHERE user_id=? AND status='completed' AND verified_at IS NOT NULL",
			"verified_weight_kg": "SELECT COALESCE(SUM(final_weight_kg),0) FROM pickups WHERE user_id=? AND status='completed' AND verified_at IS NOT NULL",
			"cash_reward":        "SELECT COALESCE(SUM(r.amount),0) FROM pickup_rewards r JOIN pickups p ON p.id=r.pickup_id WHERE p.user_id=?",
			"cash_paid":          "SELECT COALESCE(SUM(r.amount),0) FROM pickup_rewards r JOIN pickups p ON p.id=r.pickup_id WHERE p.user_id=? AND r.status='paid'",
			"points_balance":     "SELECT COALESCE((SELECT balance FROM point_wallets WHERE user_id=?),0)",
			"lifetime_points":    "SELECT COALESCE((SELECT lifetime FROM point_wallets WHERE user_id=?),0)",
			"facility_reports":   "SELECT COUNT(*) FROM facility_reports WHERE reporter_id=?",
			"redemptions":        "SELECT COUNT(*) FROM voucher_redemptions WHERE user_id=?",
		}
	case models.RolePetugas:
		args = []any{actor.ID}
		queries = map[string]string{
			"assigned_pickups":         "SELECT COUNT(*) FROM pickups WHERE collector_id=?",
			"completed_pickups":        "SELECT COUNT(*) FROM pickups WHERE collector_id=? AND status='completed'",
			"in_progress_pickups":      "SELECT COUNT(*) FROM pickups WHERE collector_id=? AND status IN ('pickup','transit','arrived')",
			"active_facility_tasks":    "SELECT COUNT(*) FROM facility_assignments WHERE petugas_id=? AND status='active'",
			"completed_facility_tasks": "SELECT COUNT(*) FROM facility_assignments WHERE petugas_id=? AND status='completed'",
		}
	case models.RoleAdmin:
		queries = map[string]string{
			"reports":              "SELECT COUNT(*) FROM facility_reports",
			"pending_verification": "SELECT COUNT(*) FROM facility_reports WHERE status='pending'",
			"approved_reports":     "SELECT COUNT(*) FROM facility_reports WHERE status='approved'",
			"awaiting_assignment":  "SELECT COUNT(*) FROM facility_handling WHERE status='approved'",
			"assigned":             "SELECT COUNT(*) FROM facility_assignments WHERE status='active'",
			"awaiting_validation":  "SELECT COUNT(*) FROM facility_handling WHERE status='resolution_submitted'",
			"handling_in_progress": "SELECT COUNT(*) FROM facility_handling WHERE status='handling_in_progress'",
			"completed":            "SELECT COUNT(*) FROM facility_handling WHERE status='completed'",
		}
	case models.RoleAdministrator:
		queries = map[string]string{
			"accounts":            "SELECT COUNT(*) FROM users",
			"active_accounts":     "SELECT COUNT(*) FROM users WHERE is_active=TRUE",
			"pickups":             "SELECT COUNT(*) FROM pickups",
			"completed_pickups":   "SELECT COUNT(*) FROM pickups WHERE status='completed'",
			"facility_reports":    "SELECT COUNT(*) FROM facility_reports",
			"cash_pending":        "SELECT COALESCE(SUM(amount),0) FROM pickup_rewards WHERE status='pending'",
			"cash_paid":           "SELECT COALESCE(SUM(amount),0) FROM pickup_rewards WHERE status='paid'",
			"legacy_transactions": "SELECT COUNT(*) FROM transactions",
			"active_vouchers":     "SELECT COUNT(*) FROM voucher_catalog WHERE active=TRUE AND valid_from<=UTC_TIMESTAMP() AND valid_until>UTC_TIMESTAMP()",
			"voucher_redemptions": "SELECT COUNT(*) FROM voucher_redemptions",
			"points_balance":      "SELECT COALESCE(SUM(balance),0) FROM point_wallets",
		}
	}
	for key, query := range queries {
		var value float64
		if err := a.DB.QueryRowContext(ctx, query, args...).Scan(&value); err != nil {
			phase9Error(w)
			return
		}
		data[key] = value
	}
	data["snapshot"] = "live aggregates; concurrent activity may change between counts"
	phase9OK(w, data, 200)
}

type facilityGridQuery struct {
	MinLat, MaxLat, MinLng, MaxLng float64
	Limit                          int
	Category                       string
}

func parseFacilityGrid(r *http.Request) (facilityGridQuery, bool) {
	q := facilityGridQuery{MinLat: -90, MaxLat: 90, MinLng: -180, MaxLng: 180, Limit: 50}
	allowed := map[string]bool{"min_lat": true, "max_lat": true, "min_lng": true, "max_lng": true, "limit": true, "category": true}
	for key, values := range r.URL.Query() {
		if !allowed[key] || len(values) != 1 || values[0] == "" {
			return q, false
		}
	}
	if !parseGridBounds(r, &q) {
		return q, false
	}
	if q.MinLat >= q.MaxLat || q.MinLng >= q.MaxLng {
		return q, false
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 100 {
			return q, false
		}
		q.Limit = n
	}
	q.Category = r.URL.Query().Get("category")
	switch q.Category {
	case "", "tps", "collection_site", "waste_bank", "other":
	default:
		return q, false
	}
	return q, true
}

func (a *App) facilityGrid(w http.ResponseWriter, r *http.Request) {
	if a.contributionActor(w, r, models.RoleAdmin, models.RoleAdministrator) == nil {
		return
	}
	q, ok := parseFacilityGrid(r)
	if !ok {
		(&apiProblem{"Filter grid tidak valid. Bounding box wajib lengkap, terurut, dan WGS84; limit 1–100.", 400}).write(w)
		return
	}
	rows, err := a.DB.QueryContext(r.Context(), `SELECT FLOOR(latitude*100)/100,FLOOR(longitude*100)/100,COUNT(*) FROM facility_reports
 WHERE status='approved' AND latitude IS NOT NULL AND longitude IS NOT NULL
 AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? AND (?='' OR category=?)
 GROUP BY FLOOR(latitude*100),FLOOR(longitude*100) HAVING COUNT(*)>=3 ORDER BY COUNT(*) DESC,1,2 LIMIT ?`, q.MinLat, q.MaxLat, q.MinLng, q.MaxLng, q.Category, q.Category, q.Limit+1)
	if err != nil {
		phase9Error(w)
		return
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		var lat, lng float64
		var count int
		if rows.Scan(&lat, &lng, &count) != nil {
			phase9Error(w)
			return
		}
		items = append(items, map[string]any{"south": lat, "west": lng, "count": count})
	}
	if rows.Err() != nil {
		phase9Error(w)
		return
	}
	truncated := len(items) > q.Limit
	if truncated {
		items = items[:q.Limit]
	}
	phase9OK(w, map[string]any{"cells": items, "cell_degrees": 0.01, "minimum_reports_per_cell": 3, "truncated": truncated, "interpretation": "Jumlah laporan fasilitas disetujui per sel; bukan kepadatan sampah atau sampel populasi representatif."}, 200)
}

func (a *App) listAccounts(w http.ResponseWriter, r *http.Request) {
	if a.contributionActor(w, r, models.RoleAdministrator) == nil {
		return
	}
	limit, before, ok := phase9Page(w, r)
	if !ok {
		return
	}
	rows, err := a.DB.QueryContext(r.Context(), "SELECT id,name,email,role,is_active FROM users WHERE (?=0 OR id<?) ORDER BY id DESC LIMIT ?", before, before, limit)
	if err != nil {
		phase9Error(w)
		return
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		var id int
		var name, email, role string
		var active bool
		if rows.Scan(&id, &name, &email, &role, &active) != nil {
			phase9Error(w)
			return
		}
		items = append(items, map[string]any{"id": id, "name": name, "email": email, "role": role, "is_active": active})
	}
	if rows.Err() != nil {
		phase9Error(w)
		return
	}
	phase9OK(w, items, 200)
}

func (a *App) changeAccount(w http.ResponseWriter, r *http.Request) {
	actor := a.contributionActor(w, r, models.RoleAdministrator)
	if actor == nil {
		return
	}
	id, ok := positiveFacilityNumber(r.PathValue("id"))
	if !ok || id == actor.ID {
		(&apiProblem{"ID tidak valid atau perubahan akun sendiri ditolak.", 400}).write(w)
		return
	}
	var body struct {
		Role           string `json:"role"`
		Active         *bool  `json:"is_active"`
		ExpectedRole   string `json:"expected_role"`
		ExpectedActive *bool  `json:"expected_active"`
		Reason         string `json:"reason"`
	}
	if !phase9Body(w, r, &body) {
		return
	}
	body.Reason = strings.TrimSpace(body.Reason)
	if !models.ValidRole(body.Role) || !models.ValidRole(body.ExpectedRole) || body.Active == nil || body.ExpectedActive == nil || len(body.Reason) < 10 || len(body.Reason) > 1000 {
		(&apiProblem{"Role, status, kondisi sebelumnya, dan alasan 10–1000 byte wajib valid.", 400}).write(w)
		return
	}
	tx, err := a.DB.BeginTx(r.Context(), nil)
	if err != nil {
		phase9Error(w)
		return
	}
	defer tx.Rollback()
	if !lockAccountAuthority(w, r, tx, actor.ID) {
		return
	}
	oldRole, oldActive, problem := lockedAccountChange(r, tx, id, body.Role, body.ExpectedRole, *body.ExpectedActive)
	if problem != nil {
		problem.write(w)
		return
	}
	if oldRole == models.RolePetugas && !(*body.Active) && !officerAvailable(w, r, tx, id) {
		return
	}
	if _, err = tx.ExecContext(r.Context(), "UPDATE users SET role=?,is_active=? WHERE id=?", body.Role, *body.Active, id); err != nil {
		phase9Error(w)
		return
	}
	if _, err = tx.ExecContext(r.Context(), "DELETE FROM auth_sessions WHERE user_id=?", id); err != nil {
		phase9Error(w)
		return
	}
	if phase9Audit(r.Context(), tx, actor.ID, "account_change", int64(id), map[string]any{"before_role": oldRole, "before_active": oldActive, "role": body.Role, "active": *body.Active, "reason": body.Reason}) != nil {
		phase9Error(w)
		return
	}
	if tx.Commit() != nil {
		phase9Error(w)
		return
	}
	phase9OK(w, map[string]any{"id": id, "sessions_revoked": true}, 200)
}

func (a *App) contributionAudit(w http.ResponseWriter, r *http.Request) {
	if a.contributionActor(w, r, models.RoleAdministrator) == nil {
		return
	}
	limit, before, ok := phase9Page(w, r)
	if !ok {
		return
	}
	rows, err := a.DB.QueryContext(r.Context(), "SELECT id,actor_id,action,entity_id,details,UNIX_TIMESTAMP(created_at) FROM phase9_audit WHERE (?=0 OR id<?) ORDER BY id DESC LIMIT ?", before, before, limit)
	if err != nil {
		phase9Error(w)
		return
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		var id, entity, actor int64
		var action, details string
		var epoch int64
		if rows.Scan(&id, &actor, &action, &entity, &details, &epoch) != nil {
			phase9Error(w)
			return
		}
		items = append(items, map[string]any{"id": id, "actor_id": actor, "action": action, "entity_id": entity, "details": details, "created_at": time.Unix(epoch, 0).UTC()})
	}
	if rows.Err() != nil {
		phase9Error(w)
		return
	}
	phase9OK(w, items, 200)
}

func lockAccountAuthority(w http.ResponseWriter, r *http.Request, tx *sql.Tx, actorID int) bool {
	// Shared control-row lock serializes administrative account changes.
	var control int
	if tx.QueryRowContext(r.Context(), "SELECT id FROM contribution_rules WHERE id=1 FOR UPDATE").Scan(&control) != nil {
		phase9Error(w)
		return false
	}
	// Revalidate authority after the lock, including a concurrent session revocation.
	var authorized bool
	if tx.QueryRowContext(r.Context(), "SELECT (role='administrator' AND is_active=TRUE) FROM users WHERE id=? FOR UPDATE", actorID).Scan(&authorized) != nil {
		phase9Error(w)
		return false
	}
	if !authorized {
		(&apiProblem{"Otoritas akun berubah.", 403}).write(w)
		return false
	}

	return true
}

func officerAvailable(w http.ResponseWriter, r *http.Request, tx *sql.Tx, id int) bool {
	var tasks int
	if tx.QueryRowContext(r.Context(), "SELECT (SELECT COUNT(*) FROM pickups WHERE collector_id=? AND status IN ('pickup','transit','arrived'))+(SELECT COUNT(*) FROM facility_assignments WHERE petugas_id=? AND status='active')", id, id).Scan(&tasks) != nil {
		phase9Error(w)
		return false
	}
	if tasks > 0 {
		(&apiProblem{"Selesaikan atau alihkan tugas aktif sebelum perubahan akun.", 409}).write(w)
		return false
	}
	return true
}

func validGridNumber(n, minimum, maximum float64) bool {
	return !math.IsNaN(n) && !math.IsInf(n, 0) && n >= minimum && n <= maximum
}

func parseGridBounds(r *http.Request, q *facilityGridQuery) bool {
	fields := []struct {
		key      string
		target   *float64
		min, max float64
	}{{"min_lat", &q.MinLat, -90, 90}, {"max_lat", &q.MaxLat, -90, 90}, {"min_lng", &q.MinLng, -180, 180}, {"max_lng", &q.MaxLng, -180, 180}}
	present := 0
	for _, field := range fields {
		if value := r.URL.Query().Get(field.key); value != "" {
			n, err := strconv.ParseFloat(value, 64)
			if err != nil || !validGridNumber(n, field.min, field.max) {
				return false
			}
			*field.target = n
			present++
		}
	}
	if present != 0 && present != 4 {
		return false
	}

	return true
}

func lockedAccountChange(r *http.Request, tx *sql.Tx, id int, role, expectedRole string, expectedActive bool) (string, bool, *apiProblem) {
	var oldRole string
	var oldActive bool
	err := tx.QueryRowContext(r.Context(), "SELECT role,is_active FROM users WHERE id=? FOR UPDATE", id).Scan(&oldRole, &oldActive)
	if err == sql.ErrNoRows {
		return "", false, &apiProblem{"Akun tidak ditemukan.", 404}
	}
	if err != nil {
		return "", false, &apiProblem{"Kesalahan layanan akun.", 500}
	}
	if oldRole != expectedRole || oldActive != expectedActive {
		return "", false, &apiProblem{"Akun telah berubah. Muat ulang.", 409}
	}
	// Account administration may change activation, but must not escalate or replace roles.
	if role != oldRole {
		return "", false, &apiProblem{"Role akun tidak dapat diubah melalui Administrator.", 403}
	}

	return oldRole, oldActive, nil
}
