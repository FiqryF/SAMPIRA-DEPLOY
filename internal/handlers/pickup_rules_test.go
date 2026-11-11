package handlers

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"testing"

	"ecorecycle/internal/models"
)

func TestPickupTransitions(t *testing.T) {
	statuses := []string{"pending", "pickup", "transit", "arrived", "completed", "cancelled", "unknown"}
	for _, current := range statuses {
		for _, next := range statuses {
			want := current == "pickup" && next == "transit" || current == "transit" && next == "arrived"
			if got := validPickupTransition(current, next); got != want {
				t.Errorf("transition %s -> %s: got %v, want %v", current, next, got, want)
			}
		}
	}
}

func TestPickupOwnership(t *testing.T) {
	for _, tc := range []struct {
		role     string
		assigned sql.NullInt64
		want     bool
	}{
		{models.RoleAdmin, sql.NullInt64{Int64: 7, Valid: true}, false},
		{models.RolePetugas, sql.NullInt64{Int64: 7, Valid: true}, true},
		{models.RolePetugas, sql.NullInt64{Int64: 8, Valid: true}, false},
		{models.RolePetugas, sql.NullInt64{}, false},
	} {
		if got := ownsPickupStatus(&models.TokenPayload{ID: 7, Role: tc.role}, tc.assigned); got != tc.want {
			t.Errorf("ownership role=%s assigned=%v: %v", tc.role, tc.assigned, got)
		}
	}
}

func TestRewardAmounts(t *testing.T) {
	if got := rewardValue(123.45, 1.25); got != 154.31 {
		t.Fatalf("gross=%v", got)
	}
	if got := netReward(154.31, 12.50); got != 141.81 {
		t.Fatalf("net=%v", got)
	}
	if got := netReward(0, 12.50); got != 0 {
		t.Fatalf("negative net=%v", got)
	}
	for _, raw := range []string{"NaN", "Inf", "0", "0.001", "100000", "-1"} {
		if _, err := pickupWeight(raw); err == nil {
			t.Fatalf("accepted weight %q", raw)
		}
	}
}
func TestPhotoExtensions(t *testing.T) {
	for _, ext := range []string{".jpg", ".jpeg", ".png", ".webp"} {
		if !validPhotoExtension(ext) {
			t.Errorf("rejected %s", ext)
		}
	}
	for _, ext := range []string{"", ".exe", ".svg", ".php", ".jpg.exe"} {
		if validPhotoExtension(ext) {
			t.Errorf("accepted %s", ext)
		}
	}
}

func TestPickupMethodGuards(t *testing.T) {
	app := &App{}
	for _, handler := range []http.HandlerFunc{app.RequestPickupHandler, app.AssignCollectorHandler, app.ProcessPayoutHandler, app.PickupStatusPostHandler} {
		w := httptest.NewRecorder()
		handler(w, httptest.NewRequest(http.MethodGet, "/", nil))
		if w.Code != http.StatusMethodNotAllowed {
			t.Fatalf("got %d", w.Code)
		}
	}
}
