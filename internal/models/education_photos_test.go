package models

import "testing"

func TestEducationPhotosScan(t *testing.T) {
	var photos EducationPhotos
	if err := photos.Scan([]byte(`[{"url":"https://example.com/a.jpg","alt":"Foto artikel"}]`)); err != nil || len(photos) != 1 {
		t.Fatalf("photo metadata: %v", err)
	}
	if err := photos.Scan(nil); err != nil || len(photos) != 0 {
		t.Fatalf("legacy article: %v", err)
	}
	if photos.Scan([]byte(`invalid`)) == nil {
		t.Fatal("invalid metadata accepted")
	}
}
