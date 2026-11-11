package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
	"github.com/go-sql-driver/mysql"
)

const pickupIdempotencyHeader = "Idempotency-Key"

func (a *App) RequestPickupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	user, err := a.apiSession(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}
	if user.Role != models.RoleUser {
		httpx.SendResponse(w, "error", "Akses ditolak. Pengajuan penjemputan hanya dapat dibuat oleh Eco Warrior.", nil, http.StatusForbidden)
		return
	}
	key := r.Header.Get(pickupIdempotencyHeader)
	// Legacy API clients without a key retain their existing behavior.
	if !validPickupKey(r, key) {
		(&apiProblem{"Idempotency-Key harus UUID v4 huruf kecil.", http.StatusBadRequest}).write(w)
		return
	}

	data, location, problem := readPickupRequest(r)
	if problem != nil {
		problem.write(w)
		return
	}
	for key, value := range data {
		data[key] = strings.TrimSpace(value)
	}
	if !validPickupContact(data["pickup_address"], data["contact_phone"]) || len(data["item_description"]) > 2000 {
		httpx.SendResponse(w, "error", "Alamat, nomor kontak Indonesia, atau deskripsi tidak valid.", nil, http.StatusBadRequest)
		return
	}

	if missing := missingPickupField(data); missing != "" {
		httpx.SendResponse(w, "error", fmt.Sprintf("Field '%s' wajib diisi.", missing), nil, http.StatusBadRequest)
		return
	}

	prepared, problem := a.preparePickupPricing(r, data)
	if problem != nil {
		problem.write(w)
		return
	}
	catID, weight, categoryItems, rewardPerKg, processingFeePerKg := prepared.catID, prepared.weight, prepared.categoryItems, prepared.rewardPerKg, prepared.processingFeePerKg
	photo, extension, _, problem := readPickupImage(r, "photo")
	if problem != nil {
		problem.write(w)
		return
	}
	fingerprint := pickupFingerprint(data, catID, weight, location, photo)
	if key != "" && a.respondPickupReplay(w, r, user.ID, key, fingerprint) {
		return
	}
	photoURL, problem := savePickupPhoto(photo, extension)
	if problem != nil {
		problem.write(w)
		return
	}
	photoCommitted := false
	defer func() {
		discardPickupPhoto(photoURL, photoCommitted)
	}()
	ecoReward := rewardValue(rewardPerKg, weight)
	processingFee := rewardValue(processingFeePerKg, weight)
	ecoReward, processingFee = categoryRewards(categoryItems, ecoReward, processingFee)
	trackingNum := fmt.Sprintf("ECR-%s-%s", time.Now().Format("20060102"), rand.Text())

	photoCommitted = a.persistPickup(w, r, pickupCreateData{userID: user.ID, key: key, data: data, location: location, photoURL: photoURL, fingerprint: fingerprint, categoryItems: categoryItems, catID: catID, weight: weight, ecoReward: ecoReward, processingFee: processingFee, trackingNum: trackingNum})
}

func discardPickupPhoto(photoURL *string, committed bool) {
	if photoURL != nil && !committed {
		_ = os.Remove(*photoURL)
	}
}

func (a *App) ListPickupsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	user, err := a.apiSession(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}

	queryType := r.URL.Query().Get("type")
	if queryType == "" {
		queryType = "all"
	}
	if queryType == "collector" {
		queryType = models.RolePetugas
	}
	switch queryType {
	case models.RoleUser, models.RolePetugas, "all":
	default:
		httpx.SendResponse(w, "error", "Tipe daftar tidak valid.", nil, http.StatusBadRequest)
		return
	}
	if queryType != user.Role || queryType == "all" {
		httpx.SendResponse(w, "error", "Akses daftar penjemputan ditolak.", nil, http.StatusForbidden)
		return
	}

	var rows *sql.Rows
	var qErr error

	if queryType == models.RoleUser {
		query := `SELECT p.id, p.user_id, p.collector_id, p.tracking_number, p.item_description, p.pickup_address, p.contact_phone, p.weight_kg, p.category_id, p.eco_reward, p.processing_fee, p.photo_url, p.is_processed, p.status, p.created_at, p.final_weight_kg, p.final_eco_reward, p.final_processing_fee, p.verification_notes, p.verified_at, c.category_name, pr.status, pr.amount, EXISTS(SELECT 1 FROM transactions t WHERE t.pickup_id=p.id), p.latitude, p.longitude, p.category_items
				  FROM pickups p
				  LEFT JOIN waste_categories c ON p.category_id = c.id
                  LEFT JOIN pickup_rewards pr ON pr.pickup_id = p.id
				  WHERE p.user_id = ?
				  ORDER BY p.created_at DESC`
		rows, qErr = a.DB.Query(query, user.ID)
	} else {
		query := `SELECT p.id, p.user_id, p.collector_id, p.tracking_number, CASE WHEN p.collector_id IS NOT NULL THEN p.item_description END, CASE WHEN p.collector_id IS NOT NULL THEN p.pickup_address END, CASE WHEN p.collector_id IS NOT NULL THEN p.contact_phone END, p.weight_kg, p.category_id, p.eco_reward, p.processing_fee, CASE WHEN p.collector_id IS NOT NULL THEN p.photo_url END, p.is_processed, p.status, p.created_at, p.final_weight_kg, p.final_eco_reward, p.final_processing_fee, p.verification_notes, p.verified_at, c.category_name, pr.status, pr.amount, EXISTS(SELECT 1 FROM transactions t WHERE t.pickup_id=p.id), CASE WHEN p.collector_id = ? THEN p.latitude END, CASE WHEN p.collector_id = ? THEN p.longitude END, CASE WHEN p.collector_id IS NOT NULL THEN u.name END AS donor_name, p.category_items
				  FROM pickups p
				  LEFT JOIN waste_categories c ON p.category_id = c.id
                  LEFT JOIN pickup_rewards pr ON pr.pickup_id = p.id
				  LEFT JOIN users u ON p.user_id = u.id
				  WHERE p.collector_id = ? OR (p.status = 'pending' AND p.collector_id IS NULL)
				  ORDER BY p.created_at DESC`
		rows, qErr = a.DB.Query(query, user.ID, user.ID, user.ID)
	}

	if qErr != nil {
		httpx.SendResponse(w, "error", "Gagal mengambil data penjemputan dari database.", nil, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	list := make([]map[string]interface{}, 0)
	for rows.Next() {
		item, scanErr := scanPickupListRow(rows, queryType)
		if scanErr != nil {
			(&apiProblem{"Gagal membaca daftar penjemputan.", http.StatusInternalServerError}).write(w)
			return
		}
		list = append(list, item)
	}

	if rows.Err() != nil {
		(&apiProblem{"Gagal membaca daftar penjemputan.", http.StatusInternalServerError}).write(w)
		return
	}
	httpx.SendResponse(w, "success", "Daftar penjemputan sampah berhasil diambil.", list, http.StatusOK)
}

func (a *App) UpdatePickupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	user, err := a.apiSession(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}
	if user.Role != models.RoleUser {
		httpx.SendResponse(w, "error", "Akses ditolak. Hanya Eco Warrior yang dapat mengubah pengajuan.", nil, http.StatusForbidden)
		return
	}

	data, location, problem := readPickupRequest(r)
	if problem != nil {
		problem.write(w)
		return
	}
	trackingNum := strings.TrimSpace(data["tracking_number"])
	itemDescription := strings.TrimSpace(data["item_description"])
	pickupAddress := strings.TrimSpace(data["pickup_address"])
	contactPhone := strings.TrimSpace(data["contact_phone"])
	categoryName := strings.TrimSpace(data["category"])

	if trackingNum == "" || itemDescription == "" || pickupAddress == "" || contactPhone == "" || categoryName == "" || data["weight_kg"] == "" {
		httpx.SendResponse(w, "error", "Nomor tracking, deskripsi, alamat, kontak, kategori, dan berat wajib diisi.", nil, http.StatusBadRequest)
		return
	}

	weight, err := pickupWeight(data["weight_kg"])
	if !validPickupContact(pickupAddress, contactPhone) || len(itemDescription) > 2000 {
		httpx.SendResponse(w, "error", "Alamat, nomor kontak Indonesia, atau deskripsi tidak valid.", nil, http.StatusBadRequest)
		return
	}
	if err != nil {
		httpx.SendResponse(w, "error", "Berat sampah harus berupa angka positif.", nil, http.StatusBadRequest)
		return
	}

	var catID int
	var rewardPerKg, processingFeePerKg float64
	err = a.DB.QueryRow("SELECT id, reward_per_kg, processing_fee_per_kg FROM waste_categories WHERE category_name = ?", categoryName).
		Scan(&catID, &rewardPerKg, &processingFeePerKg)
	if err != nil {
		httpx.SendResponse(w, "error", "Kategori sampah tidak ditemukan.", nil, http.StatusBadRequest)
		return
	}

	var categoryItems []pickupCategoryItem
	if data["items"] != "" {
		categoryItems, catID, weight, _, _, err = a.priceRequestItems(r, data)
		if err != nil {
			(&apiProblem{err.Error(), 400}).write(w)
			return
		}
	}
	ecoReward := rewardValue(rewardPerKg, weight)
	processingFee := rewardValue(processingFeePerKg, weight)

	ecoReward, processingFee = categoryRewards(categoryItems, ecoReward, processingFee)
	a.persistPickupUpdate(w, r, pickupUpdateData{userID: user.ID, data: data, location: location, trackingNum: trackingNum, itemDescription: itemDescription, pickupAddress: pickupAddress, contactPhone: contactPhone, catID: catID, weight: weight, ecoReward: ecoReward, processingFee: processingFee, categoryItems: categoryItems})
}

func pickupCancellationReason(reason string) string {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return "Pengajuan dibatalkan oleh Eco Warrior sebelum diambil petugas."
	}
	return reason
}

func (a *App) CancelPickupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	user, err := a.apiSession(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}
	if user.Role != models.RoleUser {
		httpx.SendResponse(w, "error", "Akses ditolak. Hanya Eco Warrior yang dapat membatalkan pengajuan.", nil, http.StatusForbidden)
		return
	}

	data := httpx.RequestData(r)
	trackingNum := strings.TrimSpace(data["tracking_number"])
	reason := pickupCancellationReason(data["reason"])
	if trackingNum == "" {
		httpx.SendResponse(w, "error", "Nomor tracking wajib diisi.", nil, http.StatusBadRequest)
		return
	}

	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec("UPDATE pickups SET status = 'cancelled' WHERE tracking_number = ? AND user_id = ? AND status = 'pending'", trackingNum, user.ID)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal membatalkan pengajuan.", nil, http.StatusInternalServerError)
		return
	}
	affected, err := res.RowsAffected()
	if err != nil || affected == 0 {
		httpx.SendResponse(w, "error", "Pengajuan tidak dapat dibatalkan. Pastikan status masih menunggu petugas.", nil, http.StatusBadRequest)
		return
	}

	var pickupID int
	err = tx.QueryRow(pickupIDQuery, trackingNum).Scan(&pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal menemukan ID pengajuan.", nil, http.StatusInternalServerError)
		return
	}
	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, actor_id, status, location, notes) VALUES (?, ?, 'cancelled', 'Lokasi Masyarakat (User)', ?)", pickupID, user.ID, reason)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal mencatat riwayat pembatalan.", nil, http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Pengajuan berhasil dibatalkan.", map[string]interface{}{
		"tracking_number": trackingNum,
		"status":          models.StatusCancelled,
	}, http.StatusOK)
}

func (a *App) AssignCollectorHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	user, err := a.apiSession(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}
	if user.Role != models.RolePetugas {
		httpx.SendResponse(w, "error", "Akses ditolak. Hanya Petugas yang dapat mengambil tugas.", nil, http.StatusForbidden)
		return
	}

	data := httpx.RequestData(r)
	trackingNum := data["tracking_number"]
	if trackingNum == "" {
		httpx.SendResponse(w, "error", "Nomor tracking wajib diisi.", nil, http.StatusBadRequest)
		return
	}

	collectorID := user.ID

	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec("UPDATE pickups SET collector_id = ?, status = 'pickup' WHERE tracking_number = ? AND status = 'pending' AND collector_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = ? AND role = ? AND is_active = TRUE)", collectorID, trackingNum, collectorID, models.RolePetugas)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal menetapkan tugas penjemputan.", nil, http.StatusInternalServerError)
		return
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil || rowsAffected == 0 {
		httpx.SendResponse(w, "error", "Tugas tidak tersedia. Pastikan nomor tracking valid dan masih berstatus pending.", nil, http.StatusBadRequest)
		return
	}

	var pickupID int
	err = tx.QueryRow(pickupIDQuery, trackingNum).Scan(&pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", pickupIDLookupMessage, nil, http.StatusInternalServerError)
		return
	}

	notes := fmt.Sprintf("Penjemputan diambil alih oleh Petugas: %s", user.Name)
	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, actor_id, status, location, notes) VALUES (?, ?, 'pickup', 'Petugas Wilayah', ?)", pickupID, user.ID, notes)
	if err != nil {
		httpx.SendResponse(w, "error", pickupHistorySaveMessage, nil, http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Tugas penjemputan berhasil diambil.", map[string]interface{}{
		"tracking_number": trackingNum,
		"collector_id":    collectorID,
	}, http.StatusOK)
}

func (a *App) preparePickupPricing(r *http.Request, data map[string]string) (pickupCreateData, *apiProblem) {
	weight, err := pickupWeight(data["weight_kg"])
	if err != nil {
		return pickupCreateData{}, &apiProblem{"Berat sampah harus berupa angka numerik positif dan lebih besar dari 0 KG.", 400}
	}

	categoryName := strings.TrimSpace(data["category"])
	var catID int
	var catDisplayName string
	var rewardPerKg, processingFeePerKg float64

	err = a.DB.QueryRow("SELECT id, category_name, reward_per_kg, processing_fee_per_kg FROM waste_categories WHERE category_name = ?", categoryName).
		Scan(&catID, &catDisplayName, &rewardPerKg, &processingFeePerKg)
	if errors.Is(err, sql.ErrNoRows) {
		return pickupCreateData{}, &apiProblem{"Kategori sampah tidak ditemukan.", 400}
	}
	if err != nil {
		return pickupCreateData{}, &apiProblem{"Kategori sampah belum dapat dibaca.", http.StatusInternalServerError}
	}
	var categoryItems []pickupCategoryItem
	if data["items"] != "" {
		var err error
		categoryItems, catID, weight, _, _, err = a.priceRequestItems(r, data)
		if err != nil {
			return pickupCreateData{}, &apiProblem{err.Error(), 400}
		}
	}
	return pickupCreateData{catID: catID, weight: weight, categoryItems: categoryItems, rewardPerKg: rewardPerKg, processingFeePerKg: processingFeePerKg}, nil
}

type pickupCreateData struct {
	rewardPerKg, processingFeePerKg  float64
	userID                           int
	key                              string
	data                             map[string]string
	location                         pickupLocation
	photoURL                         *string
	fingerprint                      [32]byte
	categoryItems                    []pickupCategoryItem
	catID                            int
	weight, ecoReward, processingFee float64
	trackingNum                      string
}

func (a *App) persistPickup(w http.ResponseWriter, r *http.Request, input pickupCreateData) (photoCommitted bool) {
	userID, key, data, location, photoURL := input.userID, input.key, input.data, input.location, input.photoURL
	categoryItems, catID, weight, ecoReward, processingFee, trackingNum := input.categoryItems, input.catID, input.weight, input.ecoReward, input.processingFee, input.trackingNum
	tx, err := a.DB.BeginTx(r.Context(), nil)
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return photoCommitted
	}
	defer tx.Rollback()

	res, err := tx.Exec("INSERT INTO pickups (user_id, tracking_number, item_description, pickup_address, contact_phone, weight_kg, category_id, eco_reward, processing_fee, photo_url, latitude, longitude, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
		userID, trackingNum, data["item_description"], data["pickup_address"], data["contact_phone"], weight, catID, ecoReward, processingFee, photoURL, location.latitude, location.longitude)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal menyimpan data penjemputan.", nil, http.StatusInternalServerError)
		return photoCommitted
	}

	pickupID, err := res.LastInsertId()
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal mengambil ID penjemputan.", nil, http.StatusInternalServerError)
		return photoCommitted
	}

	if len(categoryItems) > 0 {
		if _, err = tx.ExecContext(r.Context(), "UPDATE pickups SET category_items=? WHERE id=?", encodePickupItems(categoryItems), pickupID); err != nil {
			(&apiProblem{"Gagal menyimpan rincian kategori.", 500}).write(w)
			return photoCommitted
		}
	}
	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, actor_id, status, location, notes) VALUES (?, ?, 'pending', 'Lokasi Masyarakat (User)', 'Permohonan penjemputan baru diajukan.')", pickupID, userID)
	if err != nil {
		httpx.SendResponse(w, "error", pickupHistorySaveMessage, nil, http.StatusInternalServerError)
		return photoCommitted
	}
	receipt := pickupReceipt{pickupID, trackingNum, ecoReward, processingFee, models.StatusPending}
	if key != "" && !a.persistPickupReceipt(w, r, tx, input, receipt) {
		return photoCommitted
	}
	// A commit error can be ambiguous. Preserve the file once a commit is attempted.
	photoCommitted = true
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return photoCommitted
	}

	httpx.SendResponse(w, "success", "Permohonan penjemputan sampah berhasil dibuat.", receipt, http.StatusCreated)
	return photoCommitted
}

func categoryRewards(items []pickupCategoryItem, reward, fee float64) (float64, float64) {
	if len(items) == 0 {
		return reward, fee
	}
	reward, fee = 0, 0
	for _, item := range items {
		reward += item.Reward
		fee += item.Fee
	}
	return reward, fee
}

type pickupUpdateData struct {
	userID, catID                                             int
	data                                                      map[string]string
	location                                                  pickupLocation
	trackingNum, itemDescription, pickupAddress, contactPhone string
	weight, ecoReward, processingFee                          float64
	categoryItems                                             []pickupCategoryItem
}

func (a *App) persistPickupUpdate(w http.ResponseWriter, r *http.Request, input pickupUpdateData) {
	userID, data, location := input.userID, input.data, input.location
	trackingNum, itemDescription, pickupAddress, contactPhone := input.trackingNum, input.itemDescription, input.pickupAddress, input.contactPhone
	catID, weight, ecoReward, processingFee, categoryItems := input.catID, input.weight, input.ecoReward, input.processingFee, input.categoryItems
	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var pickupID int
	var status string
	err = tx.QueryRow("SELECT id, status FROM pickups WHERE tracking_number = ? AND user_id = ? FOR UPDATE", trackingNum, userID).Scan(&pickupID, &status)
	if err == sql.ErrNoRows {
		httpx.SendResponse(w, "error", "Pengajuan tidak ditemukan atau bukan milik Anda.", nil, http.StatusNotFound)
		return
	}
	if err != nil {
		httpx.SendResponse(w, "error", "Kesalahan database.", nil, http.StatusInternalServerError)
		return
	}
	if status != models.StatusPending {
		httpx.SendResponse(w, "error", "Pengajuan hanya dapat diubah sebelum diambil Petugas.", nil, http.StatusConflict)
		return
	}

	var previousItems sql.NullString
	if err = tx.QueryRowContext(r.Context(), "SELECT category_items FROM pickups WHERE id=?", pickupID).Scan(&previousItems); err != nil {
		(&apiProblem{"Gagal membaca rincian kategori.", 500}).write(w)
		return
	}
	if previousItems.Valid && data["items"] == "" {
		(&apiProblem{"Rincian kategori wajib disertakan saat mengubah permintaan ini.", 400}).write(w)
		return
	}
	if len(categoryItems) > 0 {
		if _, err = tx.ExecContext(r.Context(), "UPDATE pickups SET category_items=? WHERE id=?", encodePickupItems(categoryItems), pickupID); err != nil {
			(&apiProblem{"Gagal memperbarui rincian kategori.", 500}).write(w)
			return
		}
	}
	_, err = tx.Exec(`UPDATE pickups
		SET item_description = ?, pickup_address = ?, contact_phone = ?, weight_kg = ?, category_id = ?, eco_reward = ?, processing_fee = ?,
		    latitude = CASE WHEN ? THEN ? ELSE latitude END,
		    longitude = CASE WHEN ? THEN ? ELSE longitude END
		WHERE id = ? AND status = 'pending'`, itemDescription, pickupAddress, contactPhone, weight, catID, ecoReward, processingFee,
		location.provided, location.latitude, location.provided, location.longitude, pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal memperbarui pengajuan.", nil, http.StatusInternalServerError)
		return
	}
	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, actor_id, status, location, notes) VALUES (?, ?, 'pending', 'Lokasi Masyarakat (User)', 'Pengajuan diperbarui oleh Eco Warrior sebelum diambil petugas.')", pickupID, userID)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal mencatat riwayat perubahan.", nil, http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Pengajuan berhasil diperbarui.", map[string]interface{}{
		"tracking_number": trackingNum,
		"eco_reward":      ecoReward,
		"processing_fee":  processingFee,
		"status":          models.StatusPending,
	}, http.StatusOK)
}

func (a *App) persistPickupReceipt(w http.ResponseWriter, r *http.Request, tx *sql.Tx, input pickupCreateData, receipt pickupReceipt) bool {

	response, _ := json.Marshal(receipt)
	_, err := tx.ExecContext(r.Context(), `INSERT INTO pickup_requests
			(user_id,request_key,fingerprint,pickup_id,response) VALUES (?,?,?,?,?)`,
		input.userID, input.key, input.fingerprint[:], receipt.PickupID, response)
	if err != nil {
		// A concurrent winner can commit while this insert waits on the unique key.
		tx.Rollback()
		var databaseError *mysql.MySQLError
		if errors.As(err, &databaseError) && databaseError.Number == 1062 {
			saved, problem := a.pickupReplay(r.Context(), input.userID, input.key, input.fingerprint)
			if problem != nil {
				problem.write(w)
				return false
			}
			if saved != nil {
				httpx.SendResponse(w, "success", "Pengajuan ini sudah tercatat.", saved, http.StatusOK)
				return false
			}
		}
		(&apiProblem{"Pengajuan belum dapat disimpan. Coba lagi dengan key yang sama.", http.StatusInternalServerError}).write(w)
		return false
	}

	return true
}

func missingPickupField(data map[string]string) string {
	for _, field := range []string{"item_description", "pickup_address", "contact_phone", "weight_kg", "category"} {
		if data[field] == "" {
			return field
		}
	}
	return ""
}

func (a *App) respondPickupReplay(w http.ResponseWriter, r *http.Request, userID int, key string, fingerprint [32]byte) bool {

	saved, problem := a.pickupReplay(r.Context(), userID, key, fingerprint)
	if problem != nil {
		problem.write(w)
		return true
	}
	if saved != nil {
		httpx.SendResponse(w, "success", "Pengajuan ini sudah tercatat.", saved, http.StatusOK)
		return true
	}

	return false
}

func validPickupKey(r *http.Request, key string) bool {
	values := r.Header.Values(pickupIdempotencyHeader)
	return len(values) == 0 || (len(values) == 1 && facilityRequestKey.MatchString(key))
}
