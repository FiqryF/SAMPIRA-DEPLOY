package repositories

// EnsureWorkflowSchema applies the additive Phase 2 migration to a Phase 1 database.
func (r *PickupRepository) EnsureWorkflowSchema() error {
	var exists int
	if err := r.DB.QueryRow(`SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pickup_history' AND COLUMN_NAME='actor_id'`).Scan(&exists); err != nil {
		return err
	}
	if exists == 0 {
		if _, err := r.DB.Exec(`ALTER TABLE pickup_history ADD actor_id INT DEFAULT NULL,
   ADD FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL`); err != nil {
			return err
		}
	}
	_, err := r.DB.Exec(`CREATE TABLE IF NOT EXISTS pickup_rewards (
  pickup_id INT PRIMARY KEY,
  amount DECIMAL(15,2) NOT NULL,
  status ENUM('not_due','pending','paid') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reference VARCHAR(100) UNIQUE,
  proof LONGBLOB,
  proof_type VARCHAR(20),
  proof_digest BINARY(32) UNIQUE,
  paid_by INT,
  paid_at TIMESTAMP NULL,
  FOREIGN KEY (pickup_id) REFERENCES pickups(id),
  FOREIGN KEY (paid_by) REFERENCES users(id),
  CHECK ((status = 'not_due' AND amount = 0) OR (status IN ('pending','paid') AND amount > 0)),
  CHECK (status <> 'paid' OR (reference IS NOT NULL AND proof IS NOT NULL AND proof_type IS NOT NULL
    AND proof_digest IS NOT NULL AND paid_by IS NOT NULL AND paid_at IS NOT NULL))
 ) ENGINE=InnoDB`)
	return err
}
