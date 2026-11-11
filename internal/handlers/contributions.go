package handlers

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
)

func (a *App) RegisterContributions(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/user/contributions", a.contributionSummary)
	mux.HandleFunc("GET /api/user/points", a.pointHistory)
	mux.HandleFunc("GET /api/user/rewards", a.cashHistory)
	mux.HandleFunc("GET /api/vouchers", a.voucherCatalog)
	mux.HandleFunc("POST /api/vouchers/{id}/redeem", a.redeemVoucher)
	mux.HandleFunc("GET /api/user/vouchers", a.myVouchers)
	mux.HandleFunc("GET /api/administrator/vouchers", a.voucherCatalog)
	mux.HandleFunc("POST /api/administrator/vouchers", a.saveVoucher)
	mux.HandleFunc("PUT /api/administrator/vouchers/{id}", a.saveVoucher)
	mux.HandleFunc("POST /api/administrator/pickup-rewards/{id}/void", a.voidCashReward)
	mux.HandleFunc("GET /api/analytics", a.roleAnalytics)
	mux.HandleFunc("GET /api/analytics/facility-grid", a.facilityGrid)
	mux.HandleFunc("GET /api/administrator/accounts", a.listAccounts)
	mux.HandleFunc("PATCH /api/administrator/accounts/{id}", a.changeAccount)
	mux.HandleFunc("GET /api/administrator/contribution-audit", a.contributionAudit)
}

func (a *App) contributionActor(w http.ResponseWriter, r *http.Request, roles ...string) *models.TokenPayload {
	w.Header().Set("Cache-Control", "no-store")
	actor, err := a.apiSession(r)
	if err != nil {
		(&apiProblem{err.Error(), 401}).write(w)
		return nil
	}
	for _, role := range roles {
		if actor.Role == role {
			return actor
		}
	}
	(&apiProblem{"Akses ditolak.", 403}).write(w)
	return nil
}

func phase9Error(w http.ResponseWriter) {
	(&apiProblem{"Operasi belum dapat diselesaikan. Coba lagi dengan key yang sama.", 500}).write(w)
}
func phase9OK(w http.ResponseWriter, data any, status int) {
	httpx.SendResponse(w, "success", "Berhasil.", data, status)
}

func phase9Body(w http.ResponseWriter, r *http.Request, target any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	dec.DisallowUnknownFields()
	if err := dec.Decode(target); err != nil {
		(&apiProblem{"Body JSON tidak valid.", 400}).write(w)
		return false
	}
	if dec.Decode(new(any)) != io.EOF {
		(&apiProblem{"Body JSON tidak valid.", 400}).write(w)
		return false
	}
	return true
}

// Cursor pagination is bounded for every new list endpoint.
func phase9Page(w http.ResponseWriter, r *http.Request) (int, int64, bool) {
	limit := 20
	var before int64
	for key, values := range r.URL.Query() {
		if (key != "limit" && key != "before") || len(values) != 1 {
			(&apiProblem{"Query tidak dikenal atau berulang.", 400}).write(w)
			return 0, 0, false
		}
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		n, e := strconv.Atoi(v)
		if e != nil || n < 1 || n > 100 {
			(&apiProblem{"limit harus 1–100.", 400}).write(w)
			return 0, 0, false
		}
		limit = n
	}
	if v := r.URL.Query().Get("before"); v != "" {
		n, e := strconv.ParseInt(v, 10, 64)
		if e != nil || n <= 0 {
			(&apiProblem{"before tidak valid.", 400}).write(w)
			return 0, 0, false
		}
		before = n
	}
	return limit, before, true
}

func phase9Audit(ctx context.Context, tx *sql.Tx, actor int, action string, id int64, details any) error {
	data, err := json.Marshal(details)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO phase9_audit(actor_id,action,entity_id,details) VALUES(?,?,?,?)", actor, action, id, string(data))
	return err
}

func contributionPoints(weight float64, rate int64) int64 {
	// Existing weight validation permits two decimals. Calculate with hundredths
	// so binary floating-point cannot turn 0.29 kg * 100 into 28 points.
	return int64(math.Round(weight*100)) * rate / 100
}
func contributionLevel(lifetime int64) (string, []string) {
	level := "Pemula"
	badges := []string{}
	if lifetime > 0 {
		badges = append(badges, "Kontributor")
	}
	if lifetime >= 100 {
		level = "Penggerak"
		badges = append(badges, "Penggerak Hijau")
	}
	if lifetime >= 500 {
		level = "Pelestari"
		badges = append(badges, "Pelestari Lingkungan")
	}
	return level, badges
}

// Runs inside the same transaction as verified weight and the cash obligation.
// Existing records are intentionally not awarded retroactive points by migration.
func awardPickupContribution(ctx context.Context, tx *sql.Tx, pickupID, actor int, weight float64, amount float64, reason string) error {
	var owner int
	var rate int64
	if err := tx.QueryRowContext(ctx, "SELECT user_id FROM pickups WHERE id=?", pickupID).Scan(&owner); err != nil {
		return err
	}
	if err := tx.QueryRowContext(ctx, "SELECT points_per_kg FROM contribution_rules WHERE id=1").Scan(&rate); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO cash_reward_events(pickup_id,event,amount,actor_id,reason) VALUES(?,'accrual',?,?,?)", pickupID, amount, actor, reason); err != nil {
		return err
	}
	points := contributionPoints(weight, rate)
	if points == 0 {
		return nil
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO point_wallets(user_id) VALUES(?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)", owner); err != nil {
		return err
	}
	var balance int64
	if err := tx.QueryRowContext(ctx, "SELECT balance FROM point_wallets WHERE user_id=? FOR UPDATE", owner).Scan(&balance); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO point_entries(user_id,source_key,amount,balance_after,description) VALUES(?,?,?,?,?)", owner, fmt.Sprintf("pickup:%d", pickupID), points, balance+points, fmt.Sprintf("Berat aktual %.3f kg, aturan %d poin/kg", weight, rate)); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, "UPDATE point_wallets SET balance=balance+?,lifetime=lifetime+? WHERE user_id=?", points, points, owner)
	return err
}

func (a *App) contributionSummary(w http.ResponseWriter, r *http.Request) {
	actor := a.contributionActor(w, r, models.RoleUser)
	if actor == nil {
		return
	}
	var balance, lifetime, rate int64
	err := a.DB.QueryRowContext(r.Context(), "SELECT COALESCE(w.balance,0),COALESCE(w.lifetime,0),c.points_per_kg FROM contribution_rules c LEFT JOIN point_wallets w ON w.user_id=? WHERE c.id=1", actor.ID).Scan(&balance, &lifetime, &rate)
	if err != nil {
		phase9Error(w)
		return
	}
	level, badges := contributionLevel(lifetime)
	phase9OK(w, map[string]any{"balance": balance, "lifetime_points": lifetime, "level": level, "badges": badges, "points_per_kg": rate, "rounding": "floor(weight_kg * points_per_kg)", "retroactive": false, "cash_convertible": false, "level_thresholds": map[string]int{"Pemula": 0, "Penggerak": 100, "Pelestari": 500}}, 200)
}

func (a *App) pointHistory(w http.ResponseWriter, r *http.Request) {
	actor := a.contributionActor(w, r, models.RoleUser)
	if actor == nil {
		return
	}
	limit, before, ok := phase9Page(w, r)
	if !ok {
		return
	}
	rows, err := a.DB.QueryContext(r.Context(), "SELECT id,amount,balance_after,description,UNIX_TIMESTAMP(created_at) FROM point_entries WHERE user_id=? AND (?=0 OR id<?) ORDER BY id DESC LIMIT ?", actor.ID, before, before, limit)
	if err != nil {
		phase9Error(w)
		return
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		var id, amount, balance int64
		var description string
		var epoch int64
		if rows.Scan(&id, &amount, &balance, &description, &epoch) != nil {
			phase9Error(w)
			return
		}
		items = append(items, map[string]any{"id": id, "amount": amount, "balance_after": balance, "description": description, "created_at": time.Unix(epoch, 0).UTC()})
	}
	if rows.Err() != nil {
		phase9Error(w)
		return
	}
	phase9OK(w, items, 200)
}

func (a *App) cashHistory(w http.ResponseWriter, r *http.Request) {
	actor := a.contributionActor(w, r, models.RoleUser)
	if actor == nil {
		return
	}
	limit, before, ok := phase9Page(w, r)
	if !ok {
		return
	}
	rows, err := a.DB.QueryContext(r.Context(), `SELECT p.id,p.tracking_number,r.amount,r.status,p.final_weight_kg,
 EXISTS(SELECT 1 FROM cash_reward_events e WHERE e.pickup_id=p.id AND e.event='void')
 FROM pickup_rewards r JOIN pickups p ON p.id=r.pickup_id WHERE p.user_id=? AND (?=0 OR p.id<?) ORDER BY p.id DESC LIMIT ?`, actor.ID, before, before, limit)
	if err != nil {
		phase9Error(w)
		return
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		var id int
		var tracking, status string
		var amount float64
		var weight sql.NullFloat64
		var voided bool
		if rows.Scan(&id, &tracking, &amount, &status, &weight, &voided) != nil {
			phase9Error(w)
			return
		}
		if voided {
			status = "voided"
		}
		items = append(items, map[string]any{"pickup_id": id, "tracking_number": tracking, "amount": amount, "payment_status": status, "verified_weight_kg": weight.Float64})
	}
	if rows.Err() != nil {
		phase9Error(w)
		return
	}
	phase9OK(w, items, 200)
}

func randomVoucherCode() (string, error) {
	var b [18]byte
	_, err := rand.Read(b[:])
	return hex.EncodeToString(b[:]), err
}

type voucherInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"`
	PointCost   int64  `json:"point_cost"`
	Stock       int    `json:"stock"`
	ValidFrom   string `json:"valid_from"`
	ValidUntil  string `json:"valid_until"`
	Active      bool   `json:"active"`
	Version     int    `json:"version"`
}

func normalizeVoucherInput(body *voucherInput) (time.Time, time.Time, bool) {
	start, e1 := time.Parse(time.RFC3339, body.ValidFrom)
	end, e2 := time.Parse(time.RFC3339, body.ValidUntil)
	body.Name = strings.TrimSpace(body.Name)
	body.Category = strings.TrimSpace(body.Category)
	return start, end, !(len(body.Name) < 1 || len(body.Name) > 120 || len(body.Description) > 1000 || len(body.Category) < 1 || len(body.Category) > 60 || body.PointCost < 1 || body.PointCost > 1e9 || body.Stock < 0 || body.Stock > 1000000 || e1 != nil || e2 != nil || start.Year() < 1970 || !end.Truncate(time.Second).After(start.Truncate(time.Second)) || (body.Active && !end.After(time.Now())))
}

func (a *App) saveVoucher(w http.ResponseWriter, r *http.Request) {
	actor := a.contributionActor(w, r, models.RoleAdministrator)
	if actor == nil {
		return
	}
	var body voucherInput
	if !phase9Body(w, r, &body) {
		return
	}
	start, end, valid := normalizeVoucherInput(&body)
	if !valid {
		(&apiProblem{"Data voucher tidak valid. Tanggal wajib RFC3339 dan masa berlaku belum berakhir.", 400}).write(w)
		return
	}

	tx, err := a.DB.BeginTx(r.Context(), nil)
	if err != nil {
		phase9Error(w)
		return
	}
	defer tx.Rollback()
	var id int64
	var previous any
	if r.Method == http.MethodPost {
		res, e := tx.ExecContext(r.Context(), "INSERT INTO voucher_catalog(name,description,category,point_cost,stock,valid_from,valid_until,active) VALUES(?,?,?,?,?,?,?,?)", body.Name, body.Description, body.Category, body.PointCost, body.Stock, start.UTC(), end.UTC(), body.Active)
		if e != nil {
			phase9Error(w)
			return
		}
		id, err = res.LastInsertId()
	} else {
		n, ok := positiveFacilityNumber(r.PathValue("id"))
		if !ok || body.Version < 1 {
			(&apiProblem{"ID/version tidak valid.", 400}).write(w)
			return
		}
		id = int64(n)
		previous, ok = updateVoucherCatalog(w, r, tx, id, body, start, end)
		if !ok {
			return
		}
	}
	if err != nil {
		phase9Error(w)
		return
	}
	if err := finishVoucherSave(r.Context(), tx, actor.ID, id, previous, body); err != nil {
		phase9Error(w)
		return
	}
	phase9OK(w, map[string]any{"id": id, "simulation": true}, 200)
}

func (a *App) voucherCatalog(w http.ResponseWriter, r *http.Request) {
	admin := strings.HasPrefix(r.URL.Path, "/api/administrator/")
	roles := []string{models.RoleUser}
	if admin {
		roles = []string{models.RoleAdministrator}
	}
	if a.contributionActor(w, r, roles...) == nil {
		return
	}
	limit, before, ok := phase9Page(w, r)
	if !ok {
		return
	}
	filter := " AND active=TRUE AND valid_from<=UTC_TIMESTAMP() AND valid_until>UTC_TIMESTAMP()"
	if admin {
		filter = ""
	}
	rows, err := a.DB.QueryContext(r.Context(), "SELECT id,name,description,category,point_cost,stock,valid_from,valid_until,active,version FROM voucher_catalog WHERE (?=0 OR id<?)"+filter+" ORDER BY id DESC LIMIT ?", before, before, limit)
	if err != nil {
		phase9Error(w)
		return
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		var id, version, stock int
		var name, description, category string
		var cost int64
		var from, until time.Time
		var active bool
		if rows.Scan(&id, &name, &description, &category, &cost, &stock, &from, &until, &active, &version) != nil {
			phase9Error(w)
			return
		}
		items = append(items, map[string]any{"id": id, "name": name, "description": description, "category": category, "point_cost": cost, "stock": stock, "valid_from": from, "valid_until": until, "active": active, "version": version, "simulation": true, "notice": "Voucher simulasi, tidak berlaku di merchant nyata."})
	}
	if rows.Err() != nil {
		phase9Error(w)
		return
	}
	phase9OK(w, items, 200)
}

func (a *App) redeemVoucher(w http.ResponseWriter, r *http.Request) {
	actor := a.contributionActor(w, r, models.RoleUser)
	if actor == nil {
		return
	}
	intent, problem := voucherRedemptionRequest(r)
	if problem != nil {
		problem.write(w)
		return
	}
	id, key, expectedCost := intent.ID, intent.Key, intent.ExpectedCost
	tx, err := a.DB.BeginTx(r.Context(), nil)
	if err != nil {
		phase9Error(w)
		return
	}
	defer tx.Rollback()
	// One wallet lock serializes retries and spending across different vouchers.
	if _, err = tx.ExecContext(r.Context(), "INSERT INTO point_wallets(user_id) VALUES(?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)", actor.ID); err != nil {
		phase9Error(w)
		return
	}
	var balance int64
	if tx.QueryRowContext(r.Context(), "SELECT balance FROM point_wallets WHERE user_id=? FOR UPDATE", actor.ID).Scan(&balance) != nil {
		phase9Error(w)
		return
	}
	if existingVoucherRedemption(w, r, tx, actor.ID, id, key) {
		return
	}
	var cost int64
	var stock int
	var name, description string
	var until time.Time
	var available bool
	err = tx.QueryRowContext(r.Context(), "SELECT point_cost,stock,name,description,valid_until,(active=TRUE AND valid_from<=UTC_TIMESTAMP() AND valid_until>UTC_TIMESTAMP()) FROM voucher_catalog WHERE id=? FOR UPDATE", id).Scan(&cost, &stock, &name, &description, &until, &available)
	if err == sql.ErrNoRows {
		(&apiProblem{"Voucher tidak ditemukan.", 404}).write(w)
		return
	}
	if err != nil {
		phase9Error(w)
		return
	}
	if expectedCost != 0 && expectedCost != cost {
		(&apiProblem{"Biaya poin berubah. Muat ulang katalog dan konfirmasikan biaya terbaru.", 409}).write(w)
		return
	}
	if !available || stock < 1 || balance < cost {
		(&apiProblem{"Voucher tidak aktif/kedaluwarsa, stok habis, atau saldo poin tidak cukup.", 409}).write(w)
		return
	}
	redemption, code, err := recordVoucherRedemption(r.Context(), tx, actor.ID, id, key, balance, redemptionOffer{cost, name, description, until})
	if err != nil {
		phase9Error(w)
		return
	}
	if tx.Commit() != nil {
		phase9Error(w)
		return
	}
	phase9OK(w, map[string]any{"id": redemption, "code": code, "simulation": true}, 201)
}

func (a *App) myVouchers(w http.ResponseWriter, r *http.Request) {
	actor := a.contributionActor(w, r, models.RoleUser)
	if actor == nil {
		return
	}
	limit, before, ok := phase9Page(w, r)
	if !ok {
		return
	}
	rows, err := a.DB.QueryContext(r.Context(), "SELECT id,voucher_id,code,point_cost,name,description,valid_until,UNIX_TIMESTAMP(created_at),valid_until<=UTC_TIMESTAMP() FROM voucher_redemptions WHERE user_id=? AND (?=0 OR id<?) ORDER BY id DESC LIMIT ?", actor.ID, before, before, limit)
	if err != nil {
		phase9Error(w)
		return
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		var id, vid, cost int64
		var code, name, description string
		var until time.Time
		var epoch int64
		var expired bool
		if rows.Scan(&id, &vid, &code, &cost, &name, &description, &until, &epoch, &expired) != nil {
			phase9Error(w)
			return
		}
		status := "available_simulation"
		if expired {
			status = "expired"
		}
		items = append(items, map[string]any{"id": id, "voucher_id": vid, "code": code, "point_cost": cost, "name": name, "description": description, "valid_until": until, "created_at": time.Unix(epoch, 0).UTC(), "status": status, "simulation": true, "notice": "Tidak berlaku di merchant nyata."})
	}
	if rows.Err() != nil {
		phase9Error(w)
		return
	}
	phase9OK(w, items, 200)
}

func (a *App) voidCashReward(w http.ResponseWriter, r *http.Request) {
	actor := a.contributionActor(w, r, models.RoleAdministrator)
	if actor == nil {
		return
	}
	id, ok := positiveFacilityNumber(r.PathValue("id"))
	var body struct {
		Reason string `json:"reason"`
	}
	if !ok {
		(&apiProblem{"ID tidak valid.", 400}).write(w)
		return
	}
	if !phase9Body(w, r, &body) {
		return
	}
	body.Reason = strings.TrimSpace(body.Reason)
	if len(body.Reason) < 10 || len(body.Reason) > 1000 {
		(&apiProblem{"Alasan wajib 10–1000 byte.", 400}).write(w)
		return
	}
	tx, err := a.DB.BeginTx(r.Context(), nil)
	if err != nil {
		phase9Error(w)
		return
	}
	defer tx.Rollback()
	var amount float64
	var status string
	err = tx.QueryRowContext(r.Context(), "SELECT amount,status FROM pickup_rewards WHERE pickup_id=? FOR UPDATE", id).Scan(&amount, &status)
	if err == sql.ErrNoRows {
		(&apiProblem{"Reward tidak ditemukan.", 404}).write(w)
		return
	}
	if err != nil {
		phase9Error(w)
		return
	}
	if status != "pending" {
		(&apiProblem{"Hanya kewajiban pending yang boleh dibatalkan. Pembayaran historis tidak diubah.", 409}).write(w)
		return
	}
	if _, err = tx.ExecContext(r.Context(), "INSERT INTO cash_reward_events(pickup_id,event,amount,actor_id,reason) VALUES(?,'void',-?, ?,?)", id, amount, actor.ID, body.Reason); err != nil {
		phase9Error(w)
		return
	}
	if _, err = tx.ExecContext(r.Context(), "UPDATE pickup_rewards SET amount=0,status='not_due' WHERE pickup_id=?", id); err != nil {
		phase9Error(w)
		return
	}
	if phase9Audit(r.Context(), tx, actor.ID, "cash_void", int64(id), map[string]any{"amount": amount, "reason": body.Reason}) != nil {
		phase9Error(w)
		return
	}
	if tx.Commit() != nil {
		phase9Error(w)
		return
	}
	phase9OK(w, map[string]any{"pickup_id": id, "payment_status": "voided"}, 200)
}

func updateVoucherCatalog(w http.ResponseWriter, r *http.Request, tx *sql.Tx, id int64, body voucherInput, start, end time.Time) (any, bool) {
	var old voucherInput
	var from, until time.Time
	err := tx.QueryRowContext(r.Context(), "SELECT name,description,category,point_cost,stock,valid_from,valid_until,active,version FROM voucher_catalog WHERE id=? FOR UPDATE", id).Scan(&old.Name, &old.Description, &old.Category, &old.PointCost, &old.Stock, &from, &until, &old.Active, &old.Version)
	if err == sql.ErrNoRows {
		(&apiProblem{"Voucher tidak ditemukan.", 404}).write(w)
		return nil, false
	}
	if err != nil {
		phase9Error(w)
		return nil, false
	}
	old.ValidFrom = from.Format(time.RFC3339)
	old.ValidUntil = until.Format(time.RFC3339)
	if old.Version != body.Version {
		(&apiProblem{"Versi voucher berubah. Muat ulang.", 409}).write(w)
		return nil, false
	}
	_, err = tx.ExecContext(r.Context(), "UPDATE voucher_catalog SET name=?,description=?,category=?,point_cost=?,stock=?,valid_from=?,valid_until=?,active=?,version=version+1 WHERE id=?", body.Name, body.Description, body.Category, body.PointCost, body.Stock, start.UTC(), end.UTC(), body.Active, id)
	if err != nil {
		phase9Error(w)
		return nil, false
	}
	return old, true
}

func existingVoucherRedemption(w http.ResponseWriter, r *http.Request, tx *sql.Tx, userID, voucherID int, key string) bool {
	var redemption int64
	var savedID int
	var code string
	err := tx.QueryRowContext(r.Context(), "SELECT id,voucher_id,code FROM voucher_redemptions WHERE user_id=? AND request_key=?", userID, key).Scan(&redemption, &savedID, &code)
	if err == nil {
		if savedID != voucherID {
			(&apiProblem{"Key telah dipakai untuk voucher lain.", 409}).write(w)
			return true
		}
		phase9OK(w, map[string]any{"id": redemption, "code": code, "simulation": true}, 200)
		return true
	}
	if err != sql.ErrNoRows {
		phase9Error(w)
		return true
	}
	return false
}

type redemptionOffer struct {
	cost              int64
	name, description string
	until             time.Time
}

func recordVoucherRedemption(ctx context.Context, tx *sql.Tx, userID, id int, key string, balance int64, offer redemptionOffer) (int64, string, error) {
	cost, name, description, until := offer.cost, offer.name, offer.description, offer.until
	code, err := randomVoucherCode()
	if err != nil {
		return 0, "", err
	}
	res, err := tx.ExecContext(ctx, "INSERT INTO voucher_redemptions(user_id,voucher_id,request_key,code,point_cost,name,description,valid_until) VALUES(?,?,?,?,?,?,?,?)", userID, id, key, code, cost, name, description, until)
	if err != nil {
		return 0, "", err
	}
	redemption, err := res.LastInsertId()
	if err != nil {
		return 0, "", err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE point_wallets SET balance=balance-? WHERE user_id=? AND balance>=?", cost, userID, cost); err != nil {
		return 0, "", err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE voucher_catalog SET stock=stock-1,version=version+1 WHERE id=? AND stock>0", id); err != nil {
		return 0, "", err
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO point_entries(user_id,source_key,amount,balance_after,description) VALUES(?,?,?,?,?)", userID, fmt.Sprintf("redemption:%d", redemption), -cost, balance-cost, "Penukaran voucher simulasi: "+name); err != nil {
		return 0, "", err
	}
	if err = phase9Audit(ctx, tx, userID, "voucher_redeem", redemption, map[string]any{"voucher_id": id, "points": cost, "simulation": true}); err != nil {
		return 0, "", err
	}
	return redemption, code, nil
}

func finishVoucherSave(ctx context.Context, tx *sql.Tx, actorID int, id int64, previous any, body voucherInput) error {
	if err := phase9Audit(ctx, tx, actorID, "voucher_save", id, map[string]any{"before": previous, "after": body, "simulation": true}); err != nil {
		return err
	}
	return tx.Commit()
}

type redemptionIntent struct {
	ID           int
	Key          string
	ExpectedCost int64
}

func voucherRedemptionRequest(r *http.Request) (redemptionIntent, *apiProblem) {
	id, valid := positiveFacilityNumber(r.PathValue("id"))
	key := r.Header.Get("Idempotency-Key")
	if !valid || len(r.Header.Values("Idempotency-Key")) != 1 || !facilityRequestKey.MatchString(key) {
		return redemptionIntent{}, &apiProblem{"ID dan Idempotency-Key UUID v4 wajib valid.", 400}
	}
	// New UI confirms the displayed price. Optional for Phase 9A clients.
	var expectedCost int64
	if values := r.Header.Values("X-Expected-Point-Cost"); len(values) > 0 {
		var err error
		expectedCost, err = strconv.ParseInt(values[0], 10, 64)
		if len(values) != 1 || err != nil || expectedCost < 1 || expectedCost > 1000000000 {
			return redemptionIntent{}, &apiProblem{"Biaya poin yang dikonfirmasi tidak valid.", 400}
		}
	}
	return redemptionIntent{id, key, expectedCost}, nil
}
