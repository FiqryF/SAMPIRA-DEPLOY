package services

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"ecorecycle/internal/models"
)

const SessionTTL = 24 * time.Hour

type AuthService struct {
	secret string
}

func NewAuthService(secret string) (*AuthService, error) {
	if len(strings.TrimSpace(secret)) < 32 || secret == "EcoRecycleSecretKey_2026_SecureHMAC" || secret == "MasukkanSecretKeyHmacSha256YangSangatRahasiaDiSini" {
		return nil, fmt.Errorf("JWT_SECRET wajib berisi secret acak minimal 32 byte")
	}
	return &AuthService{secret: secret}, nil
}

func (s *AuthService) GenerateToken(userID int, role, name string) (string, error) {
	if userID <= 0 || !models.ValidRole(role) {
		return "", fmt.Errorf("invalid account")
	}
	nonce := make([]byte, 24)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	payload := models.TokenPayload{
		Nonce: hex.EncodeToString(nonce),
		ID:    userID,
		Role:  role,
		Name:  name,
		Exp:   time.Now().Add(SessionTTL).Unix(),
	}
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	encodedPayload := base64.StdEncoding.EncodeToString(jsonBytes)

	mac := hmac.New(sha256.New, []byte(s.secret))
	mac.Write([]byte(encodedPayload))
	signature := hex.EncodeToString(mac.Sum(nil))

	return encodedPayload + "." + signature, nil
}

func (s *AuthService) ValidateToken(tokenStr string) (*models.TokenPayload, error) {
	if tokenStr == "" {
		return nil, fmt.Errorf("empty token")
	}
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid token format")
	}
	encodedPayload, signature := parts[0], parts[1]

	mac := hmac.New(sha256.New, []byte(s.secret))
	mac.Write([]byte(encodedPayload))
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expectedSignature), []byte(signature)) {
		return nil, fmt.Errorf("invalid signature")
	}

	decodedPayload, err := base64.StdEncoding.DecodeString(encodedPayload)
	if err != nil {
		return nil, err
	}

	var payload models.TokenPayload
	if err := json.Unmarshal(decodedPayload, &payload); err != nil {
		return nil, err
	}
	if payload.ID <= 0 || payload.Exp <= time.Now().Unix() {
		return nil, fmt.Errorf("token expired")
	}

	return &payload, nil
}
