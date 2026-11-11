package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
)

const (
	methodNotAllowedMessage  = "Metode request tidak diizinkan."
	transactionStartMessage  = "Gagal memulai transaksi."
	transactionCommitMessage = "Gagal commit transaksi."
	pickupHistorySaveMessage = "Gagal menyimpan riwayat penjemputan."
	pickupIDLookupMessage    = "Gagal menemukan ID penjemputan."
	pickupIDQuery            = "SELECT id FROM pickups WHERE tracking_number = ?"
)

type apiProblem struct {
	message string
	status  int
}

func (p *apiProblem) write(w http.ResponseWriter) {
	httpx.SendResponse(w, "error", p.message, nil, p.status)
}

func optionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func valueOrDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func validPickupTransition(current, next string) bool {
	switch current {
	case models.StatusPickup:
		return next == models.StatusTransit
	case models.StatusTransit:
		return next == models.StatusArrived
	default:
		return false
	}
}

func ownsPickupStatus(user *models.TokenPayload, collectorID sql.NullInt64) bool {
	return user.Role == models.RolePetugas && collectorID.Valid && int(collectorID.Int64) == user.ID
}

var decimalWeight = regexp.MustCompile(`^[0-9]{1,5}(\.[0-9]{1,2})?$`)
var pickupContact = regexp.MustCompile(`^(\+62|62|0)8[0-9]{8,13}$`)

func pickupWeight(raw string) (float64, error) {
	raw = strings.TrimSpace(raw)
	weight, err := strconv.ParseFloat(raw, 64)
	if err != nil || !decimalWeight.MatchString(raw) || weight <= 0 {
		return 0, fmt.Errorf("berat harus positif dan memiliki paling banyak dua desimal")
	}
	return weight, nil
}

func validPickupContact(address, phone string) bool {
	digits := strings.NewReplacer(" ", "", "-", "").Replace(phone)
	return utf8.RuneCountInString(address) >= 15 && len(address) <= 1000 &&
		len(phone) <= 20 && pickupContact.MatchString(digits)
}
