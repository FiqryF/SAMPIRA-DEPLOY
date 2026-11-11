package repositories

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"ecorecycle/internal/models"
	"github.com/go-sql-driver/mysql"
)

var ErrFacilityConflict = errors.New("facility report state or version conflict")

type FacilityReports struct {
	DB *sql.DB
}

const facilityColumns = `r.id,r.tracking_number,r.reporter_id,r.category,r.title,r.description,r.address,
    r.latitude,r.longitude,r.status,r.version,r.reviewed_by,r.reviewed_at,r.verification_note,r.created_at,r.updated_at,
    EXISTS(SELECT 1 FROM facility_report_photos p WHERE p.report_id=r.id)`

func scanFacility(row interface{ Scan(...any) error }) (models.FacilityReport, error) {
	var report models.FacilityReport
	err := row.Scan(&report.ID, &report.TrackingNumber, &report.ReporterID, &report.Category,
		&report.Title, &report.Description, &report.Address, &report.Latitude, &report.Longitude, &report.Status,
		&report.Version, &report.ReviewedBy, &report.ReviewedAt, &report.VerificationNote, &report.CreatedAt,
		&report.UpdatedAt, &report.HasPhoto)
	return report, err
}

// A zero owner ID is used only by the authorized Admin handler.
func (s FacilityReports) Detail(ctx context.Context, id, ownerID int) (models.FacilityReport, error) {
	return scanFacility(s.DB.QueryRowContext(ctx, `SELECT `+facilityColumns+` FROM facility_reports r
        WHERE r.id=? AND (?=0 OR r.reporter_id=?)`, id, ownerID, ownerID))
}

func (s FacilityReports) List(ctx context.Context, ownerID, beforeID, limit int, status, category string) ([]models.FacilityReport, error) {
	filters := []string{"1=1"}
	args := make([]any, 0, 5)
	if ownerID != 0 {
		filters = append(filters, "r.reporter_id=?")
		args = append(args, ownerID)
	}
	if beforeID != 0 {
		filters = append(filters, "r.id<?")
		args = append(args, beforeID)
	}
	if status != "" {
		filters = append(filters, "r.status=?")
		args = append(args, status)
	}
	if category != "" {
		filters = append(filters, "r.category=?")
		args = append(args, category)
	}
	args = append(args, limit)
	rows, err := s.DB.QueryContext(ctx, `SELECT `+facilityColumns+` FROM facility_reports r WHERE `+
		strings.Join(filters, " AND ")+` ORDER BY r.id DESC LIMIT ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]models.FacilityReport, 0, limit)
	for rows.Next() {
		item, err := scanFacility(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s FacilityReports) History(ctx context.Context, id, ownerID, beforeVersion, limit int) ([]models.FacilityReportEvent, error) {
	var found int
	err := s.DB.QueryRowContext(ctx, `SELECT id FROM facility_reports WHERE id=? AND (?=0 OR reporter_id=?)`,
		id, ownerID, ownerID).Scan(&found)
	if err != nil {
		return nil, err
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT version,actor_id,from_status,to_status,note,created_at
        FROM facility_report_history WHERE report_id=? AND (?=0 OR version<?)
        ORDER BY version DESC LIMIT ?`, id, beforeVersion, beforeVersion, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]models.FacilityReportEvent, 0, limit)
	for rows.Next() {
		var item models.FacilityReportEvent
		if err := rows.Scan(&item.Version, &item.ActorID, &item.FromStatus, &item.ToStatus, &item.Note, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s FacilityReports) Photo(ctx context.Context, id, ownerID int) ([]byte, string, error) {
	var photo []byte
	var mediaType string
	err := s.DB.QueryRowContext(ctx, `SELECT p.content,p.content_type FROM facility_report_photos p
        JOIN facility_reports r ON r.id=p.report_id WHERE r.id=? AND (?=0 OR r.reporter_id=?)`,
		id, ownerID, ownerID).Scan(&photo, &mediaType)
	return photo, mediaType, err
}

func (s FacilityReports) Create(ctx context.Context, reporterID int, key string, input models.FacilityReportInput) (models.FacilityReport, bool, error) {
	var nonce [12]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return models.FacilityReport{}, false, err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return models.FacilityReport{}, false, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `INSERT INTO facility_reports
        (tracking_number,reporter_id,request_key,category,title,description,address,latitude,longitude,status,version,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))`,
		fmt.Sprintf("FAC-%X", nonce), reporterID, key, input.Category, input.Title, input.Description,
		input.Address, input.Latitude, input.Longitude, models.FacilityPending)
	if err != nil {
		var mysqlErr *mysql.MySQLError
		if errors.As(err, &mysqlErr) && mysqlErr.Number == 1062 {
			tx.Rollback()
			report, lookupErr := scanFacility(s.DB.QueryRowContext(ctx, `SELECT `+facilityColumns+
				` FROM facility_reports r WHERE r.reporter_id=? AND r.request_key=?`, reporterID, key))
			if !errors.Is(lookupErr, sql.ErrNoRows) {
				return report, false, lookupErr
			}
		}
		return models.FacilityReport{}, false, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return models.FacilityReport{}, false, err
	}
	if err := saveFacilityPhoto(ctx, tx, int(id), &input); err != nil {
		return models.FacilityReport{}, false, err
	}
	report, err := commitFacility(ctx, tx, int(id), reporterID, nil, nil)
	return report, err == nil, err
}

func (s FacilityReports) Revise(ctx context.Context, id, reporterID, version int, input models.FacilityReportInput) (models.FacilityReport, error) {
	return s.transition(ctx, id, reporterID, reporterID, version, models.FacilityRevisionRequired, models.FacilityPending, nil, &input)
}

func (s FacilityReports) Verify(ctx context.Context, id, adminID, version int, status string, note *string) (models.FacilityReport, error) {
	return s.transition(ctx, id, 0, adminID, version, models.FacilityPending, status, note, nil)
}

func (s FacilityReports) transition(ctx context.Context, id, ownerID, actorID, version int, from, to string, note *string, input *models.FacilityReportInput) (models.FacilityReport, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return models.FacilityReport{}, err
	}
	defer tx.Rollback()
	var currentStatus string
	var currentVersion int
	err = tx.QueryRowContext(ctx, `SELECT status,version FROM facility_reports
        WHERE id=? AND (?=0 OR reporter_id=?) FOR UPDATE`, id, ownerID, ownerID).Scan(&currentStatus, &currentVersion)
	if err != nil {
		return models.FacilityReport{}, err
	}
	if currentStatus != from || currentVersion != version {
		return models.FacilityReport{}, ErrFacilityConflict
	}
	if input != nil {
		_, err = tx.ExecContext(ctx, `UPDATE facility_reports SET category=?,title=?,description=?,address=?,
            latitude=?,longitude=?,status=?,version=version+1,reviewed_by=NULL,reviewed_at=NULL,
            verification_note=NULL,updated_at=UTC_TIMESTAMP(6) WHERE id=?`,
			input.Category, input.Title, input.Description, input.Address, input.Latitude, input.Longitude, to, id)
		if err == nil {
			err = saveFacilityPhoto(ctx, tx, id, input)
		}
	} else {
		_, err = tx.ExecContext(ctx, `UPDATE facility_reports SET status=?,version=version+1,reviewed_by=?,
            reviewed_at=UTC_TIMESTAMP(6),verification_note=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?`,
			to, actorID, note, id)
	}
	if err != nil {
		return models.FacilityReport{}, err
	}
	return commitFacility(ctx, tx, id, actorID, &from, note)
}

func saveFacilityPhoto(ctx context.Context, tx *sql.Tx, id int, input *models.FacilityReportInput) error {
	if len(input.Photo) == 0 {
		return nil
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO facility_report_photos (report_id,content_type,content)
        VALUES (?,?,?) ON DUPLICATE KEY UPDATE content_type=VALUES(content_type),content=VALUES(content)`,
		id, input.PhotoType, input.Photo)
	return err
}

func commitFacility(ctx context.Context, tx *sql.Tx, id, actorID int, from, note *string) (models.FacilityReport, error) {
	_, err := tx.ExecContext(ctx, `INSERT INTO facility_report_history
        (report_id,version,actor_id,from_status,to_status,note,created_at)
        SELECT id,version,?,?,status,?,updated_at FROM facility_reports WHERE id=?`, actorID, from, note, id)
	if err != nil {
		return models.FacilityReport{}, err
	}
	report, err := scanFacility(tx.QueryRowContext(ctx, `SELECT `+facilityColumns+` FROM facility_reports r WHERE r.id=?`, id))
	if err != nil {
		return models.FacilityReport{}, err
	}
	return report, tx.Commit()
}
