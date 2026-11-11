package repositories

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"ecorecycle/internal/models"
)

const handlingStatusSQL = `CASE WHEN r.status='approved' THEN COALESCE(h.status,'approved') END`

const handlingSelect = `SELECT r.id,r.tracking_number,r.title,r.description,r.category,r.address,r.latitude,r.longitude,r.status,` +
	handlingStatusSQL + `,COALESCE(h.version,0),
    CASE WHEN r.status='approved' THEN COALESCE(a.status,'unassigned') END,
    CASE WHEN r.status='approved' THEN COALESCE(h.coordination_status,'not_forwarded') END,
    h.public_result,h.public_evidence_version,h.updated_at,a.id,a.petugas_id,a.assigned_by,a.assigned_at,a.ended_at,1+(SELECT COUNT(*) FROM facility_report_affected af WHERE af.report_id=r.id)
    FROM facility_reports r LEFT JOIN facility_handling h ON h.report_id=r.id
    LEFT JOIN facility_assignments a ON a.report_id=r.id AND a.status=IF(h.status='completed','completed','active')`

func scanHandling(row interface{ Scan(...any) error }, role string) (models.FacilityHandlingSummary, error) {
	var report models.FacilityHandlingSummary
	var assignmentID, petugasID, assignedBy *int
	var assignedAt, endedAt *time.Time
	err := row.Scan(&report.ReportID, &report.TrackingNumber, &report.Title, &report.Description, &report.Category,
		&report.Address, &report.Latitude, &report.Longitude, &report.VerificationStatus, &report.Status, &report.Version,
		&report.AssignmentStatus, &report.CoordinationStatus, &report.PublicResult, &report.PublicEvidenceVersion,
		&report.UpdatedAt, &assignmentID, &petugasID, &assignedBy, &assignedAt, &endedAt, &report.AffectedCount)
	if err == nil && assignmentID != nil && role != models.RoleUser {
		report.Assignment = &models.FacilityAssignment{
			ID: *assignmentID, PetugasID: *petugasID, AssignedBy: *assignedBy, Status: *report.AssignmentStatus, AssignedAt: *assignedAt, EndedAt: endedAt,
		}
	}
	return report, err
}

func handlingAccess(actor models.TokenPayload) (string, []any) {
	switch actor.Role {
	case models.RoleAdmin:
		return "1=1", nil
	case models.RoleUser:
		return "r.reporter_id=?", []any{actor.ID}
	case models.RolePetugas:
		return "a.petugas_id=?", []any{actor.ID}
	default:
		return "1=0", nil
	}
}

type handlingQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func handlingDetail(ctx context.Context, db handlingQueryer, actor models.TokenPayload, reportID int) (models.FacilityHandlingSummary, error) {
	access, args := handlingAccess(actor)
	return scanHandling(db.QueryRowContext(ctx, handlingSelect+` WHERE r.id=? AND `+access, append([]any{reportID}, args...)...), actor.Role)
}

func (s FacilityHandling) Detail(ctx context.Context, actor models.TokenPayload, reportID int) (models.FacilityHandlingSummary, error) {
	return handlingDetail(ctx, s.DB, actor, reportID)
}

func (s FacilityHandling) List(ctx context.Context, actor models.TokenPayload, beforeID, limit int, status, category string) ([]models.FacilityHandlingSummary, error) {
	if actor.Role != models.RoleAdmin && actor.Role != models.RolePetugas {
		return nil, ErrHandlingRole
	}
	access, args := handlingAccess(actor)
	filters := []string{"r.status='approved'", access}
	if beforeID > 0 {
		filters = append(filters, "r.id<?")
		args = append(args, beforeID)
	}
	if status != "" {
		filters = append(filters, handlingStatusSQL+"=?")
		args = append(args, status)
	}
	if category != "" {
		filters = append(filters, "r.category=?")
		args = append(args, category)
	}
	args = append(args, limit)
	rows, err := s.DB.QueryContext(ctx, handlingSelect+` WHERE `+strings.Join(filters, " AND ")+` ORDER BY r.id DESC LIMIT ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	reports := make([]models.FacilityHandlingSummary, 0, limit)
	for rows.Next() {
		report, err := scanHandling(rows, actor.Role)
		if err != nil {
			return nil, err
		}
		reports = append(reports, report)
	}
	return reports, rows.Err()
}

func (s FacilityHandling) Officers(ctx context.Context, beforeID, limit int) ([]models.HandlingOfficer, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id,name FROM users WHERE role=? AND is_active=TRUE
        AND (?=0 OR id<?) ORDER BY id DESC LIMIT ?`, models.RolePetugas, beforeID, beforeID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	officers := make([]models.HandlingOfficer, 0, limit)
	for rows.Next() {
		var officer models.HandlingOfficer
		if err := rows.Scan(&officer.ID, &officer.Name); err != nil {
			return nil, err
		}
		officers = append(officers, officer)
	}
	return officers, rows.Err()
}

func (s FacilityHandling) History(ctx context.Context, actor models.TokenPayload, reportID, beforeVersion, limit int) ([]models.FacilityHandlingEvent, error) {
	// Read authorization and evidence publication from the same snapshot as the timeline.
	tx, err := s.DB.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	report, err := handlingDetail(ctx, tx, actor, reportID)
	if err != nil {
		return nil, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT e.version,e.action,e.from_status,e.to_status,e.created_at,e.public_note,
        e.coordination_status,EXISTS(SELECT 1 FROM facility_handling_photos p WHERE p.report_id=e.report_id AND p.version=e.version),
        e.actor_id,e.assignment_id,e.internal_note,e.field_condition,e.assessment,e.action_taken,e.result,
        e.agency,e.channel,e.forwarded_at,e.reference,a.petugas_id FROM facility_handling_events e
        LEFT JOIN facility_assignments a ON a.id=e.assignment_id
        WHERE e.report_id=? AND (?=0 OR e.version<?) ORDER BY e.version DESC LIMIT ?`, reportID, beforeVersion, beforeVersion, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := make([]models.FacilityHandlingEvent, 0, limit)
	for rows.Next() {
		var event models.FacilityHandlingEvent
		err := rows.Scan(&event.Version, &event.Action, &event.FromStatus, &event.ToStatus, &event.CreatedAt, &event.PublicNote,
			&event.CoordinationStatus, &event.HasPhoto, &event.ActorID, &event.AssignmentID, &event.InternalNote,
			&event.Condition, &event.Assessment, &event.ActionTaken, &event.Result, &event.Agency, &event.Channel, &event.ForwardedAt, &event.Reference, &event.PetugasID)
		if err != nil {
			return nil, err
		}
		if actor.Role != models.RoleAdmin && (actor.Role == models.RoleUser || event.Action == models.HandlingCoordinate) {
			event = publicHandlingEvent(event, report.PublicEvidenceVersion)
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func publicHandlingEvent(event models.FacilityHandlingEvent, publishedVersion *int) models.FacilityHandlingEvent {
	return models.FacilityHandlingEvent{
		Version: event.Version, Action: event.Action, FromStatus: event.FromStatus, ToStatus: event.ToStatus,
		CreatedAt: event.CreatedAt, PublicNote: event.PublicNote, CoordinationStatus: event.CoordinationStatus,
		HasPhoto: event.Action != models.HandlingCoordinate && event.HasPhoto && publishedVersion != nil && *publishedVersion == event.Version,
	}
}

func (s FacilityHandling) Photo(ctx context.Context, actor models.TokenPayload, reportID, version int) ([]byte, string, error) {
	tx, err := s.DB.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	report, err := handlingDetail(ctx, tx, actor, reportID)
	if err != nil {
		return nil, "", err
	}
	if actor.Role == models.RoleUser && (report.PublicEvidenceVersion == nil || *report.PublicEvidenceVersion != version) {
		return nil, "", sql.ErrNoRows
	}
	var data []byte
	var mediaType string
	err = tx.QueryRowContext(ctx, `SELECT p.content,p.content_type FROM facility_handling_photos p
        JOIN facility_handling_events e ON e.report_id=p.report_id AND e.version=p.version
        WHERE p.report_id=? AND p.version=? AND (? OR e.action<>'coordinate')`, reportID, version, actor.Role == models.RoleAdmin).Scan(&data, &mediaType)
	return data, mediaType, err
}
