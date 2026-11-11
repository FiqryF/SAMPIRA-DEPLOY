package handlers

import "testing"

func TestEducationPhotoURL(t *testing.T) {
	for _, test := range []struct {
		url   string
		valid bool
	}{
		{"https://images.pexels.com/photos/1/photo.jpg?w=960", true},
		{"http://example.com/image.jpg", false},
		{"javascript:alert(1)", false},
		{"data:image/svg+xml,test", false},
		{"https://user:password@example.com/image.jpg", false},
		{"https://example.com/invalid photo.jpg", false},
		{"https://example.com/\nimage.jpg", false},
		{"/assets/img/photo.jpg", false},
		{"", false},
	} {
		if got := validEducationPhotoURL(test.url); got != test.valid {
			t.Fatalf("%q: got %v", test.url, got)
		}
	}
}
