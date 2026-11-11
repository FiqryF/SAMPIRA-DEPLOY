package repositories

import (
	"context"
	"database/sql"
	"errors"

	"ecorecycle/internal/models"
)

var ErrHandlingRole = errors.New("facility handling role denied")
var ErrHandlingOfficer = errors.New("facility officer must be active")
var ErrHandlingEvidence = errors.New("facility evidence does not belong to current assignment")

type FacilityHandling struct {
	DB *sql.DB
}

type handlingState struct {
	status       string
	coordination string
	version      int
	assignmentID *int
	petugasID    *int
}

func lockHandling(ctx context.Context, tx *sql.Tx, reportID int) (handlingState, string, error) {
	var verification string
	if err := tx.QueryRowContext(ctx, `SELECT status FROM facility_reports WHERE id=? FOR UPDATE`, reportID).Scan(&verification); err != nil {
		return handlingState{}, "", err
	}
	state := handlingState{status: models.FacilityApproved, coordination: models.CoordinationNotForwarded}
	err := tx.QueryRowContext(ctx, `SELECT status,coordination_status,version
        FROM facility_handling WHERE report_id=? FOR UPDATE`, reportID).Scan(&state.status, &state.coordination, &state.version)
	if errors.Is(err, sql.ErrNoRows) {
		return state, verification, nil
	}
	if err != nil {
		return handlingState{}, "", err
	}
	err = tx.QueryRowContext(ctx, `SELECT id,petugas_id FROM facility_assignments
        WHERE active_report_id=? FOR UPDATE`, reportID).Scan(&state.assignmentID, &state.petugasID)
	if errors.Is(err, sql.ErrNoRows) {
		err = nil
	}
	return state, verification, err
}

func lockHandlingUser(ctx context.Context, tx *sql.Tx, id int, requiredRole string) (bool, error) {
	var role string
	var active bool
	err := tx.QueryRowContext(ctx, `SELECT role,is_active FROM users WHERE id=? FOR UPDATE`, id).Scan(&role, &active)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return active && role == requiredRole, err
}

func (s FacilityHandling) Apply(ctx context.Context, reportID int, actor models.TokenPayload, cmd models.HandlingCommand) (models.FacilityHandlingSummary, error) {
	if requiredRole := cmd.Action.Role(); requiredRole == "" || requiredRole != actor.Role {
		return models.FacilityHandlingSummary{}, ErrHandlingRole
	}
	tx, err := s.DB.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return models.FacilityHandlingSummary{}, err
	}
	defer tx.Rollback()
	state, verification, err := lockHandling(ctx, tx, reportID)
	if err != nil {
		return models.FacilityHandlingSummary{}, err
	}
	if actor.Role == models.RolePetugas && (state.petugasID == nil || *state.petugasID != actor.ID) {
		return models.FacilityHandlingSummary{}, sql.ErrNoRows
	}
	active, err := lockHandlingUser(ctx, tx, actor.ID, actor.Role)
	if err != nil {
		return models.FacilityHandlingSummary{}, err
	}
	if !active {
		return models.FacilityHandlingSummary{}, ErrHandlingRole
	}
	if verification != models.FacilityApproved || state.version != cmd.Version || state.version == 2147483647 {
		return models.FacilityHandlingSummary{}, ErrFacilityConflict
	}
	if cmd.Action == models.HandlingAssign && state.assignmentID != nil {
		cmd.Action = models.HandlingReassign
	}
	next := models.NextHandlingStatus(state.status, cmd.Action)
	if next == "" {
		return models.FacilityHandlingSummary{}, ErrFacilityConflict
	}
	if state.version == 0 {
		_, err = tx.ExecContext(ctx, `INSERT INTO facility_handling
            (report_id,status,version,coordination_status,updated_at) VALUES (?,?,0,?,UTC_TIMESTAMP(6))`,
			reportID, state.status, state.coordination)
		if err != nil {
			return models.FacilityHandlingSummary{}, err
		}
	}
	if err := updateHandling(ctx, tx, reportID, actor.ID, &state, next, cmd); err != nil {
		return models.FacilityHandlingSummary{}, err
	}
	report, err := scanHandling(tx.QueryRowContext(ctx, handlingSelect+` WHERE r.id=?`, reportID), actor.Role)
	if err != nil {
		return models.FacilityHandlingSummary{}, err
	}
	return report, tx.Commit()
}

func updateHandling(ctx context.Context, tx *sql.Tx, reportID, actorID int, state *handlingState, next string, cmd models.HandlingCommand) error {
	switch cmd.Action {
	case models.HandlingAssign, models.HandlingReassign:
		if err := assignHandling(ctx, tx, reportID, actorID, state, cmd); err != nil {
			return err
		}
	case models.HandlingComplete:
		if err := completeHandling(ctx, tx, reportID, state.assignmentID, cmd.PublicEvidenceVersion); err != nil {
			return err
		}
	case models.HandlingCoordinate:
		if cmd.CoordinationStatus == nil || *cmd.CoordinationStatus != models.NextHandlingCoordination(state.coordination) ||
			(*cmd.CoordinationStatus == models.CoordinationVerified && state.status != models.HandlingCompleted) {
			return ErrFacilityConflict
		}
		state.coordination = *cmd.CoordinationStatus
	}

	state.version++
	_, err := tx.ExecContext(ctx, `UPDATE facility_handling SET status=?, version=?, coordination_status=?,
        public_result=CASE WHEN ? THEN ? ELSE public_result END,
        public_evidence_version=CASE WHEN ? THEN ? ELSE public_evidence_version END,
        updated_at=UTC_TIMESTAMP(6) WHERE report_id=?`, next, state.version, state.coordination,
		cmd.Action == models.HandlingComplete, cmd.PublicNote, cmd.Action == models.HandlingComplete, cmd.PublicEvidenceVersion, reportID)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO facility_handling_events
        (report_id,version,actor_id,assignment_id,action,from_status,to_status,public_note,internal_note,
         field_condition,assessment,action_taken,result,coordination_status,agency,channel,forwarded_at,reference,created_at)
        SELECT report_id,version,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,updated_at FROM facility_handling WHERE report_id=?`,
		actorID, state.assignmentID, cmd.Action, state.status, next, cmd.PublicNote, cmd.InternalNote,
		cmd.Condition, cmd.Assessment, cmd.ActionTaken, cmd.Result, cmd.CoordinationStatus, cmd.Agency, cmd.Channel, cmd.ForwardedAt, cmd.Reference, reportID)
	if err != nil || len(cmd.Photo) == 0 {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO facility_handling_photos (report_id,version,content_type,content)
        VALUES (?,?,?,?)`, reportID, state.version, cmd.PhotoType, cmd.Photo)
	return err
}

func assignHandling(ctx context.Context, tx *sql.Tx, reportID, actorID int, state *handlingState, cmd models.HandlingCommand) error {
	if cmd.Action == models.HandlingReassign && (cmd.InternalNote == nil || *state.petugasID == cmd.PetugasID) {
		return ErrFacilityConflict
	}
	active, err := lockHandlingUser(ctx, tx, cmd.PetugasID, models.RolePetugas)
	if err != nil {
		return err
	}
	if !active {
		return ErrHandlingOfficer
	}
	if state.assignmentID != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE facility_assignments
            SET status='reassigned',ended_at=UTC_TIMESTAMP(6) WHERE id=?`, state.assignmentID); err != nil {
			return err
		}
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO facility_assignments (report_id,petugas_id,assigned_by,status,assigned_at)
        VALUES (?,?,?,'active',UTC_TIMESTAMP(6))`, reportID, cmd.PetugasID, actorID)
	if err != nil {
		return err
	}
	id, err := result.LastInsertId()
	idInt := int(id)
	state.assignmentID = &idInt
	return err
}

func completeHandling(ctx context.Context, tx *sql.Tx, reportID int, assignmentID, evidenceVersion *int) error {
	if assignmentID == nil {
		return ErrFacilityConflict
	}
	if evidenceVersion != nil {
		var found int
		err := tx.QueryRowContext(ctx, `SELECT p.version FROM facility_handling_photos p JOIN facility_handling_events e
            ON e.report_id=p.report_id AND e.version=p.version WHERE p.report_id=? AND p.version=?
            AND e.assignment_id=? AND e.action IN ('record_assessment','record_progress','submit_resolution')`,
			reportID, evidenceVersion, assignmentID).Scan(&found)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrHandlingEvidence
		}
		if err != nil {
			return err
		}
	}
	_, err := tx.ExecContext(ctx, `UPDATE facility_assignments SET status='completed',ended_at=UTC_TIMESTAMP(6) WHERE id=?`, assignmentID)
	return err
}
