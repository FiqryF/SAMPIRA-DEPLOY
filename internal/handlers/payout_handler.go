package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
	"ecorecycle/internal/services"
)

func (a *App) EstimateRewardHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	data := httpx.RequestData(r)
	categoryName := strings.TrimSpace(data["category"])
	weightStr := data["weight_kg"]
	if categoryName == "" || weightStr == "" {
		httpx.SendResponse(w, "error", "Kategori dan berat (KG) wajib diisi.", nil, http.StatusBadRequest)
		return
	}

	weight, err := pickupWeight(weightStr)
	if err != nil {
		httpx.SendResponse(w, "error", "Berat harus lebih besar dari 0 KG.", nil, http.StatusBadRequest)
		return
	}

	var catDisplayName string
	var rewardPerKg, processingFeePerKg float64
	err = a.DB.QueryRow("SELECT category_name, reward_per_kg, processing_fee_per_kg FROM waste_categories WHERE category_name = ?", categoryName).
		Scan(&catDisplayName, &rewardPerKg, &processingFeePerKg)
	if err != nil {
		httpx.SendResponse(w, "error", "Kategori sampah tidak ditemukan.", nil, http.StatusBadRequest)
		return
	}

	totalReward := rewardValue(rewardPerKg, weight)
	fee := rewardValue(processingFeePerKg, weight)
	httpx.SendResponse(w, "success", "Estimasi reward berhasil dihitung.", map[string]interface{}{
		"category":       catDisplayName,
		"weight_kg":      weight,
		"reward_rate":    rewardPerKg,
		"total_estimate": totalReward,
		"processing_fee": fee,
		"net_estimate":   netReward(totalReward, fee),
		"co2_saved":      services.CO2Saved(weight),
	}, http.StatusOK)
}

func (a *App) VerifyPickupHandler(w http.ResponseWriter, r *http.Request) {
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
		httpx.SendResponse(w, "error", "Akses ditolak. Hanya Petugas yang ditugaskan dapat mencatat berat aktual.", nil, http.StatusForbidden)
		return
	}

	data := httpx.RequestData(r)
	pickupID, err := strconv.Atoi(data["pickup_id"])
	if err != nil || pickupID <= 0 {
		httpx.SendResponse(w, "error", "pickup_id tidak valid.", nil, http.StatusBadRequest)
		return
	}
	finalWeight, err := pickupWeight(data["final_weight_kg"])
	if err != nil {
		httpx.SendResponse(w, "error", "Berat final harus berupa angka positif.", nil, http.StatusBadRequest)
		return
	}
	notes := strings.TrimSpace(data["verification_notes"])
	if len(notes) > 2000 {
		httpx.SendResponse(w, "error", "Catatan penimbangan terlalu panjang.", nil, http.StatusBadRequest)
		return
	}
	if notes == "" {
		notes = "Berat aktual dicatat oleh Petugas di hub."
	}

	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var pickupStatus string
	var assignee sql.NullInt64
	var verifiedAt sql.NullTime
	var legacyPayment bool
	var rewardPerKg, processingFeePerKg float64
	err = tx.QueryRow(`SELECT p.status, p.collector_id, p.verified_at, (p.is_processed OR EXISTS(SELECT 1 FROM transactions t WHERE t.pickup_id=p.id)), c.reward_per_kg, c.processing_fee_per_kg
		FROM pickups p
		LEFT JOIN waste_categories c ON p.category_id = c.id
		WHERE p.id = ? FOR UPDATE`, pickupID).Scan(&pickupStatus, &assignee, &verifiedAt, &legacyPayment, &rewardPerKg, &processingFeePerKg)
	if err == sql.ErrNoRows {
		httpx.SendResponse(w, "error", "Data penjemputan tidak ditemukan.", nil, http.StatusNotFound)
		return
	} else if err != nil {
		httpx.SendResponse(w, "error", "Kesalahan database.", nil, http.StatusInternalServerError)
		return
	}
	if !ownsPickupStatus(user, assignee) {
		httpx.SendResponse(w, "error", "Akses tugas ditolak.", nil, http.StatusForbidden)
		return
	}
	if verifiedAt.Valid || legacyPayment {
		httpx.SendResponse(w, "error", "Berat aktual sudah tercatat atau terdapat transaksi historis.", nil, http.StatusConflict)
		return
	}
	if pickupStatus != models.StatusArrived {
		httpx.SendResponse(w, "error", "Verifikasi berat final hanya dapat dilakukan setelah sampah tiba di hub.", nil, http.StatusBadRequest)
		return
	}

	finalReward := rewardValue(rewardPerKg, finalWeight)
	finalFee := rewardValue(processingFeePerKg, finalWeight)
	amount := netReward(finalReward, finalFee)
	paymentStatus := "pending"
	if amount == 0 {
		paymentStatus = "not_due"
	}

	_, err = tx.Exec(`UPDATE pickups
		SET final_weight_kg = ?, final_eco_reward = ?, final_processing_fee = ?, verification_notes = ?, verified_at = NOW(), status = 'completed'
		WHERE id = ?`, finalWeight, finalReward, finalFee, notes, pickupID)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal menyimpan verifikasi berat final.", nil, http.StatusInternalServerError)
		return
	}
	_, err = tx.Exec("INSERT INTO pickup_rewards (pickup_id, amount, status) VALUES (?, ?, ?)", pickupID, amount, paymentStatus)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal mencatat kewajiban reward.", nil, http.StatusInternalServerError)
		return
	}
	_, err = tx.Exec("INSERT INTO pickup_history (pickup_id, actor_id, status, location, notes) VALUES (?, ?, 'completed', 'Recycling Hub Bandung', ?)", pickupID, user.ID, notes)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal mencatat riwayat verifikasi.", nil, http.StatusInternalServerError)
		return
	}
	if err := awardPickupContribution(r.Context(), tx, pickupID, user.ID, finalWeight, amount, notes); err != nil {
		phase9Error(w)
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.SendResponse(w, "error", transactionCommitMessage, nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Berat final berhasil diverifikasi.", map[string]interface{}{
		"pickup_id":            pickupID,
		"final_weight_kg":      finalWeight,
		"final_eco_reward":     finalReward,
		"final_processing_fee": finalFee,
		"final_net_reward":     amount,
		"status":               models.StatusCompleted,
		"payment_status":       paymentStatus,
		"verification_notes":   notes,
	}, http.StatusOK)
}
