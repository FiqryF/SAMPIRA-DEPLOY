package handlers

import (
	"bytes"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFacilityCoordinates(t *testing.T) {
	cases := []struct {
		name      string
		latitude  string
		longitude string
		valid     bool
	}{
		{"absent", "", "", true},
		{"limits", "-90", "180", true},
		{"zero", "0", "0", true},
		{"precision", "-6.123456", "107.123456", true},
		{"incomplete", "", "107", false},
		{"latitude overflow", "-90.000001", "107", false},
		{"longitude overflow", "6", "180.000001", false},
		{"exponent", "1e1", "107", false},
		{"too precise", "6.1234567", "107", false},
		{"nan", "NaN", "107", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			lat, lon, valid := parseFacilityCoordinates(tc.latitude, tc.longitude)
			if valid != tc.valid {
				t.Fatalf("valid = %t, want %t", valid, tc.valid)
			}
			if (lat != nil || lon != nil) != (valid && tc.latitude != "") {
				t.Fatalf("unexpected coordinates %v, %v", lat, lon)
			}
		})
	}
}

func TestFacilityPhotoRequiresDecodableRaster(t *testing.T) {
	var file bytes.Buffer
	if err := png.Encode(&file, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	if !validFacilityPhoto(file.Bytes(), "image/png") {
		t.Fatal("valid PNG rejected")
	}
	if validFacilityPhoto(file.Bytes()[:33], "image/png") {
		t.Fatal("truncated PNG accepted")
	}
	if validFacilityPhoto(file.Bytes(), "image/webp") {
		t.Fatal("unsupported MIME accepted")
	}
}

func TestFacilityVerificationRejectsUntrustedBody(t *testing.T) {
	cases := []struct {
		name   string
		query  string
		body   string
		status int
	}{
		{"approve", "", `{"status":"approved","version":1}`, 0},
		{"revision with note", "", `{"status":"revision_required","version":2,"note":"  Tambahkan foto  "}`, 0},
		{"empty reason", "", `{"status":"rejected","version":1,"note":"   "}`, 400},
		{"mass assignment", "", `{"status":"approved","version":1,"actor_id":7}`, 400},
		{"query values", "?status=approved", `{"version":1}`, 400},
		{"trailing document", "", `{"status":"approved","version":1} {}`, 400},
		{"negative version", "", `{"status":"approved","version":-1}`, 400},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/verification"+tc.query, strings.NewReader(tc.body))
			r.Header.Set("Content-Type", "application/json")
			input, problem := readFacilityVerification(httptest.NewRecorder(), r)
			if tc.status == 0 {
				if problem != nil {
					t.Fatalf("unexpected problem: %v", problem)
				}
				if input.Status == "revision_required" && (input.Note == nil || *input.Note != "Tambahkan foto") {
					t.Fatalf("reason was not trimmed: %v", input.Note)
				}
			} else if problem == nil || problem.status != tc.status {
				t.Fatalf("problem = %v, want status %d", problem, tc.status)
			}
		})
	}
}
