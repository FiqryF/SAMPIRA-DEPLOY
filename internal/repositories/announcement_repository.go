package repositories

import (
	"database/sql"

	"ecorecycle/internal/models"
)

type AnnouncementRepository struct {
	DB *sql.DB
}

func NewAnnouncementRepository(db *sql.DB) *AnnouncementRepository {
	return &AnnouncementRepository{DB: db}
}

func (r *AnnouncementRepository) EnsureSchema() error {
	_, err := r.DB.Exec(`CREATE TABLE IF NOT EXISTS portal_announcements (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		title VARCHAR(120) NOT NULL,
		message TEXT NOT NULL,
		target_role ENUM('all', 'user', 'petugas') NOT NULL DEFAULT 'all',
		is_active BOOLEAN NOT NULL DEFAULT TRUE,
		created_by INT(11) DEFAULT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
	)`)
	if err != nil {
		return err
	}

	_, err = r.DB.Exec(`INSERT INTO portal_announcements (title, message, target_role)
		SELECT ?, ?, 'all'
		WHERE NOT EXISTS (SELECT 1 FROM portal_announcements LIMIT 1)`,
		"Layanan penjemputan Bandung aktif",
		"Pastikan alamat dan nomor WhatsApp dapat dihubungi agar proses penjemputan berjalan lancar.")
	return err
}

func (r *AnnouncementRepository) List(role string, includeInactive bool) ([]models.Announcement, error) {
	query := `SELECT id, title, message, target_role, is_active, created_by, created_at, updated_at
		FROM portal_announcements`
	args := make([]interface{}, 0, 1)
	if !includeInactive {
		query += " WHERE is_active = TRUE AND (target_role = 'all' OR target_role = ?)"
		args = append(args, role)
	}
	query += " ORDER BY created_at DESC LIMIT 20"

	rows, err := r.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.Announcement, 0)
	for rows.Next() {
		var item models.Announcement
		if err := rows.Scan(&item.ID, &item.Title, &item.Message, &item.TargetRole, &item.IsActive, &item.CreatedBy, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *AnnouncementRepository) Create(title, message, targetRole string, createdBy int) (int64, error) {
	result, err := r.DB.Exec(`INSERT INTO portal_announcements (title, message, target_role, created_by)
		VALUES (?, ?, ?, ?)`, title, message, targetRole, createdBy)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func (r *AnnouncementRepository) SetActive(id int, active bool) error {
	result, err := r.DB.Exec("UPDATE portal_announcements SET is_active = ? WHERE id = ?", active, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AnnouncementRepository) Delete(id int) error {
	result, err := r.DB.Exec("DELETE FROM portal_announcements WHERE id = ?", id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return sql.ErrNoRows
	}
	return nil
}
