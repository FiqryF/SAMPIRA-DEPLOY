package handlers

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
)

type pickupReceipt struct {
	PickupID       int64   `json:"pickup_id"`
	TrackingNumber string  `json:"tracking_number"`
	EcoReward      float64 `json:"eco_reward"`
	ProcessingFee  float64 `json:"processing_fee"`
	Status         string  `json:"status"`
}

func pickupFingerprint(data map[string]string, categoryID int, weight float64, location pickupLocation, photo []byte) [32]byte {
	// Only validated values that affect pickup creation belong in the fingerprint.
	values := []any{
		data["item_description"], data["pickup_address"], data["contact_phone"],
		categoryID, weight, location.latitude, location.longitude, sha256.Sum256(photo),
	}
	if data["items"] != "" {
		values = append(values, data["items"])
	}
	encoded, _ := json.Marshal(values)
	return sha256.Sum256(encoded)
}

func (a *App) pickupReplay(ctx context.Context, userID int, key string, fingerprint [32]byte) (*pickupReceipt, *apiProblem) {
	var savedFingerprint, response []byte
	err := a.DB.QueryRowContext(ctx, `SELECT fingerprint,response FROM pickup_requests
		WHERE user_id=? AND request_key=?`, userID, key).Scan(&savedFingerprint, &response)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, &apiProblem{"Pengajuan tersimpan belum dapat diperiksa. Coba lagi dengan key yang sama.", http.StatusInternalServerError}
	}
	if !bytes.Equal(savedFingerprint, fingerprint[:]) {
		return nil, &apiProblem{"Idempotency-Key sudah digunakan untuk pengajuan berbeda.", http.StatusConflict}
	}
	var receipt pickupReceipt
	if json.Unmarshal(response, &receipt) != nil {
		return nil, &apiProblem{"Hasil pengajuan belum dapat dibaca.", http.StatusInternalServerError}
	}
	return &receipt, nil
}
