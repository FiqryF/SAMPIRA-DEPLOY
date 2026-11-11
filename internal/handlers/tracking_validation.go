package handlers

import (
	"database/sql"
	"fmt"
	"net/http"

	"ecorecycle/internal/models"
)

func validatePickupStatusUpdate(tx *sql.Tx, user *models.TokenPayload, trackingNum, status string) *apiProblem {
	if status != models.StatusTransit && status != models.StatusArrived {
		return &apiProblem{"Status tidak valid. Status operasional yang diizinkan adalah transit atau arrived.", http.StatusBadRequest}
	}
	var currentStatus string
	var collectorID sql.NullInt64
	err := tx.QueryRow("SELECT status, collector_id FROM pickups WHERE tracking_number = ? FOR UPDATE", trackingNum).Scan(&currentStatus, &collectorID)
	if err == sql.ErrNoRows {
		return &apiProblem{"Nomor tracking tidak ditemukan.", http.StatusNotFound}
	}
	if err != nil {
		return &apiProblem{"Kesalahan database.", http.StatusInternalServerError}
	}
	if !ownsPickupStatus(user, collectorID) {
		return &apiProblem{"Akses ditolak. Petugas hanya dapat memperbarui status tugas miliknya.", http.StatusForbidden}
	}
	if !validPickupTransition(currentStatus, status) {
		return &apiProblem{fmt.Sprintf("Transisi status tidak valid dari %s ke %s.", currentStatus, status), http.StatusBadRequest}
	}
	return nil
}
