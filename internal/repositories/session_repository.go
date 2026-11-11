package repositories

import (
	"crypto/sha256"
	"database/sql"
	"time"
)

func (r *UserRepository) EnsureSessionSchema() error {
	_, err := r.DB.Exec(`CREATE TABLE IF NOT EXISTS auth_sessions (
  token_digest BINARY(32) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  expires_at BIGINT NOT NULL,
  INDEX (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
 ) ENGINE=InnoDB`)
	return err
}

func (r *UserRepository) CreateSession(userID int, passwordHash, token string, expiry time.Time) error {
	if _, err := r.DB.Exec("DELETE FROM auth_sessions WHERE expires_at <= ?", time.Now().Unix()); err != nil {
		return err
	}
	digest := sha256.Sum256([]byte(token))
	// Recheck account state and the verified credential in the statement that issues the session.
	result, err := r.DB.Exec(`INSERT INTO auth_sessions (token_digest, user_id, expires_at)
  SELECT ?, id, ? FROM users WHERE id = ? AND is_active = TRUE AND BINARY password = ?`,
		digest[:], expiry.Unix(), userID, passwordHash)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err == nil && count == 0 {
		return sql.ErrNoRows
	}
	return err
}

func (r *UserRepository) ActiveSession(userID int, token string) (role, name string, err error) {
	digest := sha256.Sum256([]byte(token))
	err = r.DB.QueryRow(`SELECT u.role, u.name FROM auth_sessions s
  JOIN users u ON u.id = s.user_id WHERE s.token_digest = ? AND s.user_id = ?
  AND s.expires_at > ? AND u.is_active = TRUE`, digest[:], userID, time.Now().Unix()).Scan(&role, &name)
	return
}

func (r *UserRepository) RevokeSession(token string) error {
	digest := sha256.Sum256([]byte(token))
	_, err := r.DB.Exec("DELETE FROM auth_sessions WHERE token_digest = ?", digest[:])
	return err
}
