package repositories

import (
	"database/sql"
	"fmt"

	"ecorecycle/internal/models"
)

type UserRepository struct {
	DB *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{DB: db}
}

func (r *UserRepository) EnsureProfileSchema() error {
	columns := map[string]string{
		"is_active":             "BOOLEAN NOT NULL DEFAULT TRUE",
		"phone":                 "VARCHAR(30) DEFAULT NULL",
		"address":               "TEXT DEFAULT NULL",
		"payout_method":         "VARCHAR(30) DEFAULT NULL",
		"payout_account_name":   "VARCHAR(120) DEFAULT NULL",
		"payout_account_number": "VARCHAR(80) DEFAULT NULL",
	}

	for column, definition := range columns {
		var exists int
		err := r.DB.QueryRow(`
			SELECT COUNT(*)
			FROM INFORMATION_SCHEMA.COLUMNS
			WHERE TABLE_SCHEMA = DATABASE()
				AND TABLE_NAME = 'users'
				AND COLUMN_NAME = ?`, column).Scan(&exists)
		if err != nil {
			return err
		}
		if exists == 0 {
			if _, err := r.DB.Exec(fmt.Sprintf("ALTER TABLE users ADD COLUMN %s %s", column, definition)); err != nil {
				return err
			}
		}
	}
	return nil
}

func (r *UserRepository) FindByEmail(email string) (*models.User, error) {
	var user models.User
	err := r.DB.QueryRow(`SELECT id, name, email, password, role, phone, address, payout_method, payout_account_name, payout_account_number
		FROM users WHERE email = ? AND is_active = TRUE`, email).
		Scan(&user.ID, &user.Name, &user.Email, &user.Password, &user.Role, &user.Phone, &user.Address, &user.PayoutMethod, &user.PayoutAccountName, &user.PayoutAccountNumber)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) FindByID(id int) (*models.User, error) {
	var user models.User
	err := r.DB.QueryRow(`SELECT id, name, email, password, role, phone, address, payout_method, payout_account_name, payout_account_number
		FROM users WHERE id = ?`, id).
		Scan(&user.ID, &user.Name, &user.Email, &user.Password, &user.Role, &user.Phone, &user.Address, &user.PayoutMethod, &user.PayoutAccountName, &user.PayoutAccountNumber)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) ListCollectors() ([]models.User, error) {
	rows, err := r.DB.Query(`SELECT id, name, email, role, phone
		FROM users
		WHERE role = ? AND is_active = TRUE
		ORDER BY name ASC`, models.RolePetugas)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	collectors := make([]models.User, 0)
	for rows.Next() {
		var user models.User
		if err := rows.Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Phone); err != nil {
			return nil, err
		}
		collectors = append(collectors, user)
	}
	return collectors, rows.Err()
}

func (r *UserRepository) EmailExists(email string) (bool, error) {
	var existingID int
	err := r.DB.QueryRow("SELECT id FROM users WHERE email = ?", email).Scan(&existingID)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func (r *UserRepository) Create(name, email, password, role string) error {
	_, err := r.DB.Exec("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", name, email, password, role)
	return err
}

func (r *UserRepository) UpdateProfile(id int, name, phone, address, payoutMethod, payoutAccountName, payoutAccountNumber string) error {
	_, err := r.DB.Exec(`UPDATE users
		SET name = ?, phone = ?, address = ?, payout_method = ?, payout_account_name = ?, payout_account_number = ?
		WHERE id = ?`, name, phone, address, payoutMethod, payoutAccountName, payoutAccountNumber, id)
	return err
}
