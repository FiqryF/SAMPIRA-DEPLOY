package models

import (
	"encoding/json"
	"fmt"
	"time"
)

type EducationPhoto struct {
	URL    string `json:"url"`
	Alt    string `json:"alt"`
	Credit string `json:"credit,omitempty"`
}
type EducationPhotos []EducationPhoto

func (photos *EducationPhotos) Scan(value any) error {
	if value == nil {
		*photos = EducationPhotos{}
		return nil
	}
	switch data := value.(type) {
	case []byte:
		return json.Unmarshal(data, photos)
	case string:
		return json.Unmarshal([]byte(data), photos)
	default:
		return fmt.Errorf("invalid education photo metadata")
	}
}

const (
	EducationDraft     = "draft"
	EducationPublished = "published"
	EducationArchived  = "archived"
)

type EducationCategory struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

func EducationCategories() []EducationCategory {
	return []EducationCategory{
		{"pemilahan-sampah", "Pemilahan Sampah"},
		{"pengurangan-sampah", "Pengurangan Sampah"},
		{"daur-ulang", "Daur Ulang"},
		{"pengomposan", "Pengomposan"},
		{"bank-sampah", "Bank Sampah"},
		{"sampah-elektronik", "Sampah Elektronik"},
		{"panduan-sampira", "Panduan SAMPIRA"},
	}
}

func ValidEducationCategory(key string) bool {
	for _, category := range EducationCategories() {
		if key == category.Key {
			return true
		}
	}
	return false
}

type EducationInput struct {
	Slug     string   `json:"slug"`
	Title    string   `json:"title"`
	Summary  string   `json:"summary"`
	Body     string   `json:"body"`
	Category string   `json:"category"`
	Sources  []string `json:"sources"`
}

type EducationSummary struct {
	ID          int             `json:"id"`
	Slug        string          `json:"slug"`
	Title       string          `json:"title"`
	Summary     string          `json:"summary"`
	Category    string          `json:"category"`
	PublishedAt *time.Time      `json:"published_at"`
	Photos      EducationPhotos `json:"photos,omitempty"`
}

type EducationArticle struct {
	EducationSummary
	Body    string   `json:"body"`
	Sources []string `json:"sources"`
}

type EducationAudit struct {
	Status    string    `json:"status"`
	Version   int       `json:"version"`
	CreatedBy int       `json:"created_by"`
	UpdatedBy int       `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type EducationManagedSummary struct {
	EducationSummary
	EducationAudit
}

type EducationManagedArticle struct {
	EducationArticle
	EducationAudit
}
