package models

import "time"

const (
	FacilityPending          = "pending"
	FacilityRevisionRequired = "revision_required"
	FacilityApproved         = "approved"
	FacilityRejected         = "rejected"
)

func ValidFacilityStatus(status string) bool {
	return status == FacilityPending || status == FacilityRevisionRequired || status == FacilityApproved || status == FacilityRejected
}

func ValidFacilityCategory(category string) bool {
	switch category {
	case "tps", "collection_site", "waste_bank", "other":
		return true
	}
	return false
}

type FacilityReport struct {
	AffectedCount    int        `json:"affected_count"`
	ID               int        `json:"id"`
	TrackingNumber   string     `json:"tracking_number"`
	ReporterID       int        `json:"reporter_id"`
	Category         string     `json:"category"`
	Title            string     `json:"title"`
	Description      string     `json:"description"`
	Address          string     `json:"address"`
	Latitude         *float64   `json:"latitude"`
	Longitude        *float64   `json:"longitude"`
	Status           string     `json:"status"`
	Version          int        `json:"version"`
	PhotoURL         *string    `json:"photo_url"`
	HasPhoto         bool       `json:"-"`
	ReviewedBy       *int       `json:"reviewed_by"`
	ReviewedAt       *time.Time `json:"reviewed_at"`
	VerificationNote *string    `json:"verification_note"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type FacilityReportInput struct {
	Category    string
	Title       string
	Description string
	Address     string
	Latitude    *float64
	Longitude   *float64
	Photo       []byte
	PhotoType   string
}

type FacilityReportEvent struct {
	Version    int       `json:"version"`
	ActorID    int       `json:"actor_id"`
	FromStatus *string   `json:"from_status"`
	ToStatus   string    `json:"to_status"`
	Note       *string   `json:"note"`
	CreatedAt  time.Time `json:"created_at"`
}
