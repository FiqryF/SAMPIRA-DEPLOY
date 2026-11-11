package handlers

import (
	"database/sql"
	"net/http"
	"time"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
)

func (a *App) PickupStatusGetHandler(w http.ResponseWriter, r *http.Request) {
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
	if queryType == "stats" {
		if user.Role != models.RoleAdministrator {
			httpx.SendResponse(w, "error", "Akses statistik ditolak.", nil, http.StatusForbidden)
			return
		}
		var totalPickups int
		var pendingVerifications int
		var totalWeight float64
		var historicalRewardRecorded float64
		var totalRewardPending float64
		var totalRewardPaid float64
		var collectorsOnline int

		err := a.DB.QueryRow(`SELECT COUNT(*),
   COUNT(CASE WHEN status = 'pending' THEN 1 END),
   COALESCE(SUM(CASE WHEN EXISTS(SELECT 1 FROM pickup_rewards r WHERE r.pickup_id=pickups.id) THEN final_weight_kg END),0),
   COALESCE(SUM(CASE WHEN is_processed THEN final_eco_reward - final_processing_fee END), 0),
   (SELECT COALESCE(SUM(amount),0) FROM pickup_rewards WHERE status='pending'),
 (SELECT COALESCE(SUM(amount),0) FROM pickup_rewards WHERE status='paid'),
   (SELECT COUNT(*) FROM users WHERE role = ? AND is_active = TRUE)
   FROM pickups`, models.RolePetugas).Scan(&totalPickups, &pendingVerifications, &totalWeight,
			&historicalRewardRecorded, &totalRewardPending, &totalRewardPaid, &collectorsOnline)
		if err != nil {
			httpx.SendResponse(w, "error", "Gagal mengambil statistik penjemputan.", nil, http.StatusInternalServerError)
			return
		}

		httpx.SendResponse(w, "success", "Statistik sampah berhasil diambil.", map[string]interface{}{
			"total_weight":               totalWeight,
			"total_reward_paid":          totalRewardPaid,
			"historical_reward_recorded": historicalRewardRecorded,
			"total_reward_pending":       totalRewardPending,
			"total_pickups":              totalPickups,
			"pending_verifications":      pendingVerifications,
			"collectors_online":          collectorsOnline,
		}, http.StatusOK)
		return
	}

	if user.Role != models.RoleUser && user.Role != models.RolePetugas {
		httpx.SendResponse(w, "error", "Akses detail penjemputan ditolak.", nil, http.StatusForbidden)
		return
	}
	trackingNum := r.URL.Query().Get("tracking_number")
	if trackingNum == "" {
		httpx.SendResponse(w, "error", "Nomor tracking wajib diisi.", nil, http.StatusBadRequest)
		return
	}

	tx, err := a.DB.BeginTx(r.Context(), &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		(&apiProblem{"Gagal membaca pelacakan.", http.StatusInternalServerError}).write(w)
		return
	}
	defer tx.Rollback()
	var p struct {
		ID                   int
		UserID               int
		CollectorID          *int
		TrackingNumber       string
		ItemDesc             *string
		PickupAddress        *string
		Latitude, Longitude  *float64
		ContactPhone         *string
		WeightKg             *float64
		FinalWeightKg        *float64
		FinalEcoReward       *float64
		FinalProcessingFee   *float64
		CategoryID           *int
		EcoReward            *float64
		ProcessingFee        *float64
		PhotoURL             *string
		IsProcessed          bool
		Status               string
		CreatedAt            time.Time
		CategoryName         *string
		DonorName            *string
		CollectorName        *string
		PaymentStatus        *string
		RewardAmount         *string
		PaymentReference     *string
		PaidAt               *time.Time
		VerifiedAt           *time.Time
		HasLegacyTransaction bool
	}

	query := `SELECT p.id, p.user_id, p.collector_id, p.tracking_number, p.item_description, p.pickup_address, p.contact_phone, p.weight_kg, p.category_id, p.eco_reward, p.processing_fee, p.photo_url, p.is_processed, p.status, p.created_at, p.final_weight_kg, p.final_eco_reward, p.final_processing_fee, c.category_name, u.name AS donor_name, col.name AS collector_name, pr.status, pr.amount, pr.reference, pr.paid_at, p.verified_at, EXISTS(SELECT 1 FROM transactions t WHERE t.pickup_id=p.id), p.latitude, p.longitude
			  FROM pickups p
			  LEFT JOIN waste_categories c ON p.category_id = c.id
			  LEFT JOIN users u ON p.user_id = u.id
			  LEFT JOIN users col ON p.collector_id = col.id
 LEFT JOIN pickup_rewards pr ON pr.pickup_id = p.id
			  WHERE p.tracking_number = ?`

	err = tx.QueryRowContext(r.Context(), query, trackingNum).Scan(
		&p.ID, &p.UserID, &p.CollectorID, &p.TrackingNumber, &p.ItemDesc, &p.PickupAddress,
		&p.ContactPhone, &p.WeightKg, &p.CategoryID, &p.EcoReward, &p.ProcessingFee,
		&p.PhotoURL, &p.IsProcessed, &p.Status, &p.CreatedAt, &p.FinalWeightKg, &p.FinalEcoReward, &p.FinalProcessingFee, &p.CategoryName,
		&p.DonorName, &p.CollectorName, &p.PaymentStatus, &p.RewardAmount, &p.PaymentReference, &p.PaidAt, &p.VerifiedAt, &p.HasLegacyTransaction,
		&p.Latitude, &p.Longitude,
	)
	if err == sql.ErrNoRows {
		httpx.SendResponse(w, "error", "Nomor tracking tidak ditemukan.", nil, http.StatusNotFound)
		return
	} else if err != nil {
		httpx.SendResponse(w, "error", "Kesalahan database.", nil, http.StatusInternalServerError)
		return
	}

	if !canReadPickup(user, p.UserID, p.CollectorID) {
		httpx.SendResponse(w, "error", "Akses detail penjemputan ditolak.", nil, http.StatusForbidden)
		return
	}
	rows, err := tx.QueryContext(r.Context(), "SELECT id, pickup_id, status, location, notes, updated_at, actor_id FROM pickup_history WHERE pickup_id = ? ORDER BY updated_at DESC, id DESC", p.ID)
	problem := &apiProblem{"Gagal membaca riwayat penjemputan.", http.StatusInternalServerError}
	if err != nil {
		problem.write(w)
		return
	}
	defer rows.Close()
	historyList := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, pickupID int
		var status string
		var location, notes *string
		var updatedAt time.Time
		var actorID *int
		if err := rows.Scan(&id, &pickupID, &status, &location, &notes, &updatedAt, &actorID); err != nil {
			problem.write(w)
			return
		}
		historyList = append(historyList, map[string]interface{}{
			"id": id, "pickup_id": pickupID, "status": status, "location": location, "notes": notes,
			"updated_at": updatedAt, "actor_id": actorID,
		})
	}
	if rows.Err() != nil {
		problem.write(w)
		return
	}

	respData := map[string]interface{}{
		"id":                   p.ID,
		"user_id":              p.UserID,
		"collector_id":         p.CollectorID,
		"tracking_number":      p.TrackingNumber,
		"item_description":     p.ItemDesc,
		"pickup_address":       p.PickupAddress,
		"latitude":             p.Latitude,
		"longitude":            p.Longitude,
		"contact_phone":        p.ContactPhone,
		"weight_kg":            p.WeightKg,
		"final_weight_kg":      p.FinalWeightKg,
		"final_eco_reward":     p.FinalEcoReward,
		"final_processing_fee": p.FinalProcessingFee,
		"category_id":          p.CategoryID,
		"eco_reward":           p.EcoReward,
		"processing_fee":       p.ProcessingFee,
		"photo_url":            p.PhotoURL,
		"is_processed":         p.IsProcessed,
		"payment_status":       models.PaymentStatus(p.Status, p.IsProcessed),
		"status":               p.Status,
		"created_at":           p.CreatedAt,
		"category_name":        p.CategoryName,
		"donor_name":           p.DonorName,
		"collector_name":       p.CollectorName,
		"history":              historyList,
	}
	if p.PaymentStatus != nil {
		respData["payment_status"] = *p.PaymentStatus
		respData["reward_amount"] = p.RewardAmount
		if user.Role == models.RoleUser {
			respData["payment_reference"] = p.PaymentReference
			respData["paid_at"] = p.PaidAt
		}
	}
	if p.PaymentStatus == nil && (p.VerifiedAt != nil || p.HasLegacyTransaction) {
		respData["payment_status"] = "requires_reconciliation"
	}
	if p.DonorName != nil {
		respData["donor_name"] = *p.DonorName
	}
	if p.CollectorName != nil {
		respData["collector_name"] = *p.CollectorName
	}

	httpx.SendResponse(w, "success", "Data pelacakan ditemukan.", respData, http.StatusOK)
}

func (a *App) PickupStatusPostHandler(w http.ResponseWriter, r *http.Request) {
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
		httpx.SendResponse(w, "error", "Akses ditolak. Hanya Petugas yang dapat memperbarui status penjemputan.", nil, http.StatusForbidden)
		return
	}

	data := httpx.RequestData(r)
	trackingNum := data["tracking_number"]
	status := data["status"]
	if trackingNum == "" || status == "" {
		httpx.SendResponse(w, "error", "Nomor tracking dan status baru wajib diisi.", nil, http.StatusBadRequest)
		return
	}
	location := valueOrDefault(data["location"], "System")
	notes := valueOrDefault(data["notes"], "Status diperbarui")

	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	if problem := validatePickupStatusUpdate(tx, user, trackingNum, status); problem != nil {
		problem.write(w)
		return
	}

	res, err := tx.Exec("UPDATE pickups SET status = ? WHERE tracking_number = ?", status, trackingNum)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal memperbarui status.", nil, http.StatusInternalServerError)
		return
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil || rowsAffected == 0 {
		httpx.SendResponse(w, "error", "Nomor tracking tidak ditemukan atau gagal diperbarui.", nil, http.StatusBadRequest)
		return
	}

	var pickupID int
	err = tx.QueryRow(pickupIDQuery, trackingNum).Scan(&pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", pickupIDLookupMessage, nil, http.StatusInternalServerError)
		return
	}
	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, actor_id, status, location, notes) VALUES (?, ?, ?, ?, ?)", pickupID, user.ID, status, location, notes)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal mencatat riwayat penjemputan.", nil, http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Status penjemputan berhasil diperbarui.", map[string]interface{}{
		"tracking_number": trackingNum,
		"status":          status,
	}, http.StatusOK)
}
