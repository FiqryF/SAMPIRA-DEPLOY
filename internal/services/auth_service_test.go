package services

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
	"testing"
	"time"

	"ecorecycle/internal/models"
)

func TestTokenValidation(t *testing.T) {
	secret := strings.Repeat("a", 32)
	auth, err := NewAuthService(secret)
	if err != nil {
		t.Fatal(err)
	}
	token, err := auth.GenerateToken(12, models.RoleAdmin, "Fixture")
	if err != nil {
		t.Fatal(err)
	}
	claims, err := auth.ValidateToken(token)
	if err != nil || claims.ID != 12 || claims.Role != models.RoleAdmin {
		t.Fatalf("unexpected claims: %v, %v", claims, err)
	}
	encoded := base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf(
		`{"id":12,"role":"admin","name":"Fixture","exp":%d}`, time.Now().Unix()-1)))
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(encoded))
	expired := encoded + "." + hex.EncodeToString(mac.Sum(nil))
	if _, err := auth.ValidateToken(expired); err == nil {
		t.Fatal("accepted an expired token with a valid signature")
	}
	if _, err := auth.ValidateToken(token + "0"); err == nil {
		t.Fatal("accepted a tampered token")
	}
}

func TestAuthSecretRequired(t *testing.T) {
	for _, secret := range []string{"", "too-short", "EcoRecycleSecretKey_2026_SecureHMAC", "MasukkanSecretKeyHmacSha256YangSangatRahasiaDiSini"} {
		if _, err := NewAuthService(secret); err == nil {
			t.Fatal("accepted an insecure secret")
		}
	}
}
