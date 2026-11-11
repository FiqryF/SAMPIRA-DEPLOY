package handlers

import (
	"net/http/httptest"
	"testing"
)

func TestContributionPointsAndLevels(t *testing.T) {
	for _, tc := range []struct {
		weight     float64
		rate, want int64
	}{{0.09, 10, 0}, {0.29, 100, 29}, {1.25, 10, 12}, {2, 0, 0}, {10000, 10, 100000}} {
		if got := contributionPoints(tc.weight, tc.rate); got != tc.want {
			t.Fatalf("weight %v: got %d want %d", tc.weight, got, tc.want)
		}
	}
	for _, tc := range []struct {
		points int64
		level  string
		badges int
	}{{0, "Pemula", 0}, {99, "Pemula", 1}, {100, "Penggerak", 2}, {499, "Penggerak", 2}, {500, "Pelestari", 3}} {
		level, badges := contributionLevel(tc.points)
		if level != tc.level || len(badges) != tc.badges {
			t.Fatalf("level mismatch for %d", tc.points)
		}
	}
}

func TestFacilityGridValidation(t *testing.T) {
	for _, query := range []string{"?limit=101", "?limit=-1", "?limit=NaN", "?min_lat=NaN&max_lat=1&min_lng=0&max_lng=1", "?min_lat=0", "?min_lat=2&max_lat=1&min_lng=0&max_lng=1", "?min_lat=0&max_lat=91&min_lng=0&max_lng=1", "?category=private", "?user_id=1", "?limit=1&limit=2", "?category="} {
		if _, ok := parseFacilityGrid(httptest.NewRequest("GET", "/"+query, nil)); ok {
			t.Errorf("accepted %s", query)
		}
	}
	for _, query := range []string{"", "?limit=100&category=tps", "?min_lat=-7&max_lat=-6&min_lng=107&max_lng=108"} {
		if _, ok := parseFacilityGrid(httptest.NewRequest("GET", "/"+query, nil)); !ok {
			t.Errorf("rejected %s", query)
		}
	}
}
