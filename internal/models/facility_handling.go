package models

import "time"

const (
	HandlingAssigned   = "assigned"
	HandlingAssessing  = "assessment_in_progress"
	HandlingInProgress = "handling_in_progress"
	HandlingSubmitted  = "resolution_submitted"
	HandlingRevision   = "resolution_revision_required"
	HandlingCompleted  = "completed"

	CoordinationNotForwarded = "not_forwarded"
	CoordinationForwarded    = "forwarded"
	CoordinationReceipt      = "receipt_confirmed"
	CoordinationFollowUp     = "follow_up_reported"
	CoordinationVerified     = "resolution_verified"
)

type HandlingAction string

const (
	HandlingAssign           HandlingAction = "assign"
	HandlingReassign         HandlingAction = "reassign"
	HandlingStartAssessment  HandlingAction = "start_assessment"
	HandlingRecordAssessment HandlingAction = "record_assessment"
	HandlingRecordProgress   HandlingAction = "record_progress"
	HandlingSubmitResolution HandlingAction = "submit_resolution"
	HandlingRequestRevision  HandlingAction = "request_revision"
	HandlingComplete         HandlingAction = "complete"
	HandlingCoordinate       HandlingAction = "coordinate"
)

func (a HandlingAction) Role() string {
	switch a {
	case HandlingStartAssessment, HandlingRecordAssessment, HandlingRecordProgress, HandlingSubmitResolution:
		return RolePetugas
	case HandlingAssign, HandlingReassign, HandlingRequestRevision, HandlingComplete, HandlingCoordinate:
		return RoleAdmin
	}
	return ""
}

func ValidHandlingStatus(value string) bool {
	switch value {
	case FacilityApproved, HandlingAssigned, HandlingAssessing, HandlingInProgress, HandlingSubmitted, HandlingRevision, HandlingCompleted:
		return true
	}
	return false
}

// NextHandlingStatus returns an empty string for a forbidden transition.
func NextHandlingStatus(current string, action HandlingAction) string {
	switch {
	case current == FacilityApproved && action == HandlingAssign:
		return HandlingAssigned
	case action == HandlingReassign && current != FacilityApproved && current != HandlingCompleted && ValidHandlingStatus(current):
		return HandlingAssigned
	case current == HandlingAssigned && action == HandlingStartAssessment:
		return HandlingInProgress
	case current == HandlingAssessing && action == HandlingRecordAssessment:
		return HandlingInProgress
	case (current == HandlingInProgress || current == HandlingRevision) && action == HandlingRecordProgress:
		return HandlingInProgress
	case (current == HandlingInProgress || current == HandlingAssessing || current == HandlingRevision) && action == HandlingSubmitResolution:
		return HandlingSubmitted
	case current == HandlingSubmitted && action == HandlingRequestRevision:
		return HandlingRevision
	case current == HandlingSubmitted && action == HandlingComplete:
		return HandlingCompleted
	case action == HandlingCoordinate && ValidHandlingStatus(current):
		return current
	}
	return ""
}

func NextHandlingCoordination(current string) string {
	switch current {
	case CoordinationNotForwarded:
		return CoordinationForwarded
	case CoordinationForwarded:
		return CoordinationReceipt
	case CoordinationReceipt:
		return CoordinationFollowUp
	case CoordinationFollowUp:
		return CoordinationVerified
	}
	return ""
}

type FacilityAssignment struct {
	ID         int        `json:"id"`
	PetugasID  int        `json:"petugas_id"`
	AssignedBy int        `json:"assigned_by"`
	Status     string     `json:"status"`
	AssignedAt time.Time  `json:"assigned_at"`
	EndedAt    *time.Time `json:"ended_at"`
}

type FacilityHandlingSummary struct {
	AffectedCount         int                 `json:"affected_count"`
	ReportID              int                 `json:"report_id"`
	TrackingNumber        string              `json:"tracking_number"`
	Title                 string              `json:"title"`
	Description           string              `json:"description"`
	Category              string              `json:"category"`
	Address               string              `json:"address"`
	Latitude              *float64            `json:"latitude"`
	Longitude             *float64            `json:"longitude"`
	VerificationStatus    string              `json:"verification_status"`
	Status                *string             `json:"status"`
	Version               int                 `json:"version"`
	AssignmentStatus      *string             `json:"assignment_status"`
	Assignment            *FacilityAssignment `json:"assignment,omitempty"`
	CoordinationStatus    *string             `json:"coordination_status"`
	PublicResult          *string             `json:"public_result"`
	PublicEvidenceVersion *int                `json:"public_evidence_version"`
	UpdatedAt             *time.Time          `json:"updated_at"`
}

type FacilityHandlingEvent struct {
	Version            int            `json:"version"`
	Action             HandlingAction `json:"action"`
	FromStatus         string         `json:"from_status"`
	ToStatus           string         `json:"to_status"`
	CreatedAt          time.Time      `json:"created_at"`
	PublicNote         *string        `json:"public_note"`
	CoordinationStatus *string        `json:"coordination_status"`
	HasPhoto           bool           `json:"has_photo"`
	ActorID            *int           `json:"actor_id,omitempty"`
	AssignmentID       *int           `json:"assignment_id,omitempty"`
	PetugasID          *int           `json:"petugas_id,omitempty"`
	InternalNote       *string        `json:"internal_note,omitempty"`
	Condition          *string        `json:"condition,omitempty"`
	Assessment         *string        `json:"assessment,omitempty"`
	ActionTaken        *string        `json:"action_taken,omitempty"`
	Result             *string        `json:"result,omitempty"`
	Agency             *string        `json:"agency,omitempty"`
	Channel            *string        `json:"channel,omitempty"`
	ForwardedAt        *time.Time     `json:"forwarded_at,omitempty"`
	Reference          *string        `json:"reference,omitempty"`
}

type HandlingOfficer struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type HandlingCommand struct {
	Action                HandlingAction
	Version               int
	PetugasID             int
	PublicEvidenceVersion *int
	FacilityHandlingEvent
	Photo     []byte
	PhotoType string
}
