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
	if data["items"] != "" {
		items, _, weight, reward, fee, err := pricePickupItems(r.Context(), a.DB, data["items"])
		if err != nil {
			(&apiProblem{err.Error(), 400}).write(w)
			return
		}
		httpx.SendResponse(w, "success", "Estimasi per kategori berhasil dihitung.", map[string]any{"items": items, "weight_kg": weight, "total_estimate": reward, "processing_fee": fee, "net_estimate": netReward(reward, fee), "co2_saved": services.CO2Saved(weight)}, 200)
		return
	}
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
	input, problem := readPickupVerificationInput(data)
	if problem != nil {
		problem.write(w)
		return
	}
	pickupID, finalWeight, notes := input.id, input.weight, input.notes

	tx, err := a.DB.Begin()
	if err != nil {
		httpx.SendResponse(w, "error", transactionStartMessage, nil, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	checked, problem := a.loadPickupVerification(tx, pickupID, user)
	if problem != nil {
		problem.write(w)
		return
	}
	categoryItems, rewardPerKg, processingFeePerKg := checked.categoryItems, checked.rewardPerKg, checked.processingFeePerKg

	finalReward := rewardValue(rewardPerKg, finalWeight)
	finalFee := rewardValue(processingFeePerKg, finalWeight)
	if categoryItems.Valid {
		reward, fee, problem := saveVerifiedCategoryItems(r, tx, pickupID, categoryItems, data["items"], finalWeight)
		if problem != nil {
			problem.write(w)
			return
		}
		finalReward, finalFee = reward, fee
	}
	amount := netReward(finalReward, finalFee)
	paymentStatus := newRewardStatus(amount)

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

type pickupVerification struct {
	categoryItems                   sql.NullString
	rewardPerKg, processingFeePerKg float64
}

func (a *App) loadPickupVerification(tx *sql.Tx, pickupID int, user *models.TokenPayload) (pickupVerification, *apiProblem) {
	var categoryItems sql.NullString
	var pickupStatus string
	var assignee sql.NullInt64
	var verifiedAt sql.NullTime
	var legacyPayment bool
	var rewardPerKg, processingFeePerKg float64
	err := tx.QueryRow(`SELECT p.status, p.collector_id, p.verified_at, (p.is_processed OR EXISTS(SELECT 1 FROM transactions t WHERE t.pickup_id=p.id)), c.reward_per_kg, c.processing_fee_per_kg, p.category_items
		FROM pickups p
		LEFT JOIN waste_categories c ON p.category_id = c.id
		WHERE p.id = ? FOR UPDATE`, pickupID).Scan(&pickupStatus, &assignee, &verifiedAt, &legacyPayment, &rewardPerKg, &processingFeePerKg, &categoryItems)
	if err == sql.ErrNoRows {
		return pickupVerification{}, &apiProblem{"Data penjemputan tidak ditemukan.", http.StatusNotFound}
	} else if err != nil {
		return pickupVerification{}, &apiProblem{"Kesalahan database.", http.StatusInternalServerError}
	}
	if !ownsPickupStatus(user, assignee) {
		return pickupVerification{}, &apiProblem{"Akses tugas ditolak.", http.StatusForbidden}
	}
	if verifiedAt.Valid || legacyPayment {
		return pickupVerification{}, &apiProblem{"Berat aktual sudah tercatat atau terdapat transaksi historis.", http.StatusConflict}
	}
	if pickupStatus != models.StatusArrived {
		return pickupVerification{}, &apiProblem{"Verifikasi berat final hanya dapat dilakukan setelah sampah tiba di hub.", http.StatusBadRequest}
	}

	return pickupVerification{categoryItems: categoryItems, rewardPerKg: rewardPerKg, processingFeePerKg: processingFeePerKg}, nil
}

func saveVerifiedCategoryItems(r *http.Request, tx *sql.Tx, pickupID int, categoryItems sql.NullString, submitted string, finalWeight float64) (float64, float64, *apiProblem) {

	raw, reward, fee, err := verifyPickupItems(r.Context(), tx, categoryItems, submitted, finalWeight)
	if err != nil {
		return 0, 0, &apiProblem{"Berat per kategori tidak valid atau tidak sesuai pengajuan. Periksa jumlah berat dan kategori.", 400}
	}
	if _, err = tx.ExecContext(r.Context(), "UPDATE pickups SET category_items=? WHERE id=?", raw, pickupID); err != nil {
		return 0, 0, &apiProblem{"Gagal menyimpan rincian penimbangan.", 500}
	}

	return reward, fee, nil
}

func newRewardStatus(amount float64) string {
	if amount == 0 {
		return "not_due"
	}
	return "pending"
}

type pickupVerificationInput struct {
	id     int
	weight float64
	notes  string
}

func readPickupVerificationInput(data map[string]string) (pickupVerificationInput, *apiProblem) {
	pickupID, err := strconv.Atoi(data["pickup_id"])
	if err != nil || pickupID <= 0 {
		return pickupVerificationInput{}, &apiProblem{"pickup_id tidak valid.", http.StatusBadRequest}
	}
	finalWeight, err := pickupWeight(data["final_weight_kg"])
	if err != nil {
		return pickupVerificationInput{}, &apiProblem{"Berat final harus berupa angka positif.", http.StatusBadRequest}
	}
	notes := strings.TrimSpace(data["verification_notes"])
	if len(notes) > 2000 {
		return pickupVerificationInput{}, &apiProblem{"Catatan penimbangan terlalu panjang.", http.StatusBadRequest}
	}
	if notes == "" {
		notes = "Berat aktual dicatat oleh Petugas di hub."
	}

	return pickupVerificationInput{pickupID, finalWeight, notes}, nil
}
