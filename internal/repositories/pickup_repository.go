package repositories

import (
	"database/sql"
	"fmt"
)

type PickupRepository struct {
	DB *sql.DB
}

func NewPickupRepository(db *sql.DB) *PickupRepository {
	return &PickupRepository{DB: db}
}

func (r *PickupRepository) EnsureVerificationSchema() error {
	columns := map[string]string{
		"final_weight_kg":      "DECIMAL(10,2) DEFAULT NULL",
		"final_eco_reward":     "DECIMAL(15,2) DEFAULT NULL",
		"final_processing_fee": "DECIMAL(15,2) DEFAULT NULL",
		"verification_notes":   "TEXT DEFAULT NULL",
		"verified_at":          "TIMESTAMP NULL DEFAULT NULL",
	}

	for column, definition := range columns {
		var exists int
		err := r.DB.QueryRow(`
			SELECT COUNT(*)
			FROM INFORMATION_SCHEMA.COLUMNS
			WHERE TABLE_SCHEMA = DATABASE()
				AND TABLE_NAME = 'pickups'
				AND COLUMN_NAME = ?`, column).Scan(&exists)
		if err != nil {
			return err
		}
		if exists == 0 {
			if _, err := r.DB.Exec(fmt.Sprintf("ALTER TABLE pickups ADD COLUMN %s %s", column, definition)); err != nil {
				return err
			}
		}
	}
	return nil
}
