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
	key := r.Header.Get("Idempotency-Key")
	// Legacy API clients without a key retain their existing behavior.
	if len(r.Header.Values("Idempotency-Key")) != 0 &&
		(len(r.Header.Values("Idempotency-Key")) != 1 || !facilityRequestKey.MatchString(key)) {
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

	requiredFields := []string{"item_description", "pickup_address", "contact_phone", "weight_kg", "category"}
	for _, field := range requiredFields {
		if data[field] == "" {
			httpx.SendResponse(w, "error", fmt.Sprintf("Field '%s' wajib diisi.", field), nil, http.StatusBadRequest)
			return
		}
	}

	weight, err := pickupWeight(data["weight_kg"])
	if err != nil {
		httpx.SendResponse(w, "error", "Berat sampah harus berupa angka numerik positif dan lebih besar dari 0 KG.", nil, http.StatusBadRequest)
		return
	}

	categoryName := strings.TrimSpace(data["category"])
	var catID int
	var catDisplayName string
	var rewardPerKg, processingFeePerKg float64

	err = a.DB.QueryRow("SELECT id, category_name, reward_per_kg, processing_fee_per_kg FROM waste_categories WHERE category_name = ?", categoryName).
		Scan(&catID, &catDisplayName, &rewardPerKg, &processingFeePerKg)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.SendResponse(w, "error", "Kategori sampah tidak ditemukan.", nil, http.StatusBadRequest)
		return
	}
	if err != nil {
		(&apiProblem{"Kategori sampah belum dapat dibaca.", http.StatusInternalServerError}).write(w)
		return
	}
	photo, extension, _, problem := readPickupImage(r, "photo")
	if problem != nil {
		problem.write(w)
		return
	}
	fingerprint := pickupFingerprint(data, catID, weight, location, photo)
	if key != "" {
		saved, problem := a.pickupReplay(r.Context(), user.ID, key, fingerprint)
		if problem != nil {
			problem.write(w)
			return
		}
		if saved != nil {
			httpx.SendResponse(w, "success", "Pengajuan ini sudah tercatat.", saved, http.StatusOK)
			return
		}
	}
	photoURL, problem := savePickupPhoto(photo, extension)
	if problem != nil {
		problem.write(w)
		return
	}
	photoCommitted := false
	defer func() {
		if photoURL != nil && !photoCommitted {
			_ = os.Remove(*photoURL)
		}
	}()
	ecoReward := rewardValue(rewardPerKg, weight)
	processingFee := rewardValue(processingFeePerKg, weight)
	trackingNum := fmt.Sprintf("ECR-%s-%s", time.Now().Format("20060102"), rand.Text())

	tx, err := a.DB.BeginTx(r.Context(), nil)
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec("INSERT INTO pickups (user_id, tracking_number, item_description, pickup_address, contact_phone, weight_kg, category_id, eco_reward, processing_fee, photo_url, latitude, longitude, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
		user.ID, trackingNum, data["item_description"], data["pickup_address"], data["contact_phone"], weight, catID, ecoReward, processingFee, photoURL, location.latitude, location.longitude)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal menyimpan data penjemputan.", nil, http.StatusInternalServerError)
		return
	}

	pickupID, err := res.LastInsertId()
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal mengambil ID penjemputan.", nil, http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, actor_id, status, location, notes) VALUES (?, ?, 'pending', 'Lokasi Masyarakat (User)', 'Permohonan penjemputan baru diajukan.')", pickupID, user.ID)
	if err != nil {
		httpx.SendResponse(w, "error", pickupHistorySaveMessage, nil, http.StatusInternalServerError)
		return
	}
	receipt := pickupReceipt{pickupID, trackingNum, ecoReward, processingFee, models.StatusPending}
	if key != "" {
		response, _ := json.Marshal(receipt)
		_, err = tx.ExecContext(r.Context(), `INSERT INTO pickup_requests
			(user_id,request_key,fingerprint,pickup_id,response) VALUES (?,?,?,?,?)`,
			user.ID, key, fingerprint[:], pickupID, response)
		if err != nil {
			// A concurrent winner can commit while this insert waits on the unique key.
			tx.Rollback()
			var databaseError *mysql.MySQLError
			if errors.As(err, &databaseError) && databaseError.Number == 1062 {
				saved, problem := a.pickupReplay(r.Context(), user.ID, key, fingerprint)
				if problem != nil {
					problem.write(w)
					return
				}
				if saved != nil {
					httpx.SendResponse(w, "success", "Pengajuan ini sudah tercatat.", saved, http.StatusOK)
					return
				}
			}
			(&apiProblem{"Pengajuan belum dapat disimpan. Coba lagi dengan key yang sama.", http.StatusInternalServerError}).write(w)
			return
		}
	}
	// A commit error can be ambiguous. Preserve the file once a commit is attempted.
	photoCommitted = true
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Permohonan penjemputan sampah berhasil dibuat.", receipt, http.StatusCreated)
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
		query := `SELECT p.id, p.user_id, p.collector_id, p.tracking_number, p.item_description, p.pickup_address, p.contact_phone, p.weight_kg, p.category_id, p.eco_reward, p.processing_fee, p.photo_url, p.is_processed, p.status, p.created_at, p.final_weight_kg, p.final_eco_reward, p.final_processing_fee, p.verification_notes, p.verified_at, c.category_name, pr.status, pr.amount, EXISTS(SELECT 1 FROM transactions t WHERE t.pickup_id=p.id), p.latitude, p.longitude
				  FROM pickups p
				  LEFT JOIN waste_categories c ON p.category_id = c.id
                  LEFT JOIN pickup_rewards pr ON pr.pickup_id = p.id
				  WHERE p.user_id = ?
				  ORDER BY p.created_at DESC`
		rows, qErr = a.DB.Query(query, user.ID)
	} else {
		query := `SELECT p.id, p.user_id, p.collector_id, p.tracking_number, CASE WHEN p.collector_id IS NOT NULL THEN p.item_description END, CASE WHEN p.collector_id IS NOT NULL THEN p.pickup_address END, CASE WHEN p.collector_id IS NOT NULL THEN p.contact_phone END, p.weight_kg, p.category_id, p.eco_reward, p.processing_fee, CASE WHEN p.collector_id IS NOT NULL THEN p.photo_url END, p.is_processed, p.status, p.created_at, p.final_weight_kg, p.final_eco_reward, p.final_processing_fee, p.verification_notes, p.verified_at, c.category_name, pr.status, pr.amount, EXISTS(SELECT 1 FROM transactions t WHERE t.pickup_id=p.id), CASE WHEN p.collector_id = ? THEN p.latitude END, CASE WHEN p.collector_id = ? THEN p.longitude END, CASE WHEN p.collector_id IS NOT NULL THEN u.name END AS donor_name
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

	ecoReward := rewardValue(rewardPerKg, weight)
	processingFee := rewardValue(processingFeePerKg, weight)

	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var pickupID int
	var status string
	err = tx.QueryRow("SELECT id, status FROM pickups WHERE tracking_number = ? AND user_id = ? FOR UPDATE", trackingNum, user.ID).Scan(&pickupID, &status)
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
	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, actor_id, status, location, notes) VALUES (?, ?, 'pending', 'Lokasi Masyarakat (User)', 'Pengajuan diperbarui oleh Eco Warrior sebelum diambil petugas.')", pickupID, user.ID)
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
	reason := strings.TrimSpace(data["reason"])
	if reason == "" {
		reason = "Pengajuan dibatalkan oleh Eco Warrior sebelum diambil petugas."
	}
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
