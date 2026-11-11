package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"testing"
)

func TestPickupCategoryInputRejectsInvalidBeforeQuery(t *testing.T) {
	for _, raw := range []string{"", "null", "[]", "{}", `[{"category":"Computers","weight_kg":-1}]`, `[{"category":"Computers","weight_kg":0.001}]`} {
		if _, _, _, _, _, err := pricePickupItems(context.Background(), nil, raw); err == nil {
			t.Fatalf("accepted invalid items %s", raw)
		}
	}
}

func TestPickupItemsFingerprintIncludesCompositionAndPreservesLegacy(t *testing.T) {
	data := map[string]string{"item_description": "fixture", "pickup_address": "fixture address", "contact_phone": "081234567890"}
	old, _ := json.Marshal([]any{data["item_description"], data["pickup_address"], data["contact_phone"], 2, float64(3), (*float64)(nil), (*float64)(nil), sha256.Sum256(nil)})
	if pickupFingerprint(data, 2, 3, pickupLocation{}, nil) != sha256.Sum256(old) {
		t.Fatal("legacy idempotency changed")
	}
	data["items"] = `[{"category":"Computers","weight_kg":2},{"category":"Small Gadgets","weight_kg":1}]`
	first := pickupFingerprint(data, 2, 3, pickupLocation{}, nil)
	data["items"] = `[{"category":"Computers","weight_kg":1},{"category":"Small Gadgets","weight_kg":2}]`
	if first == pickupFingerprint(data, 2, 3, pickupLocation{}, nil) {
		t.Fatal("different composition shares fingerprint")
	}
}
