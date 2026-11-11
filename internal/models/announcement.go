package models

import "time"

type Announcement struct {
	ID         int       `json:"id"`
	Title      string    `json:"title"`
	Message    string    `json:"message"`
	TargetRole string    `json:"target_role"`
	IsActive   bool      `json:"is_active"`
	CreatedBy  *int      `json:"created_by,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
