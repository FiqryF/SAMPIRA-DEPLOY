-- Select the existing SAMPIRA schema in the client. Stop application writers first.
-- Abort on the first SQL error. Do not use the mysql client's --force option.
SET @previous_sql_mode = @@SESSION.sql_mode;
SET SESSION sql_mode = CONCAT_WS(',', NULLIF(@previous_sql_mode, ''), 'STRICT_ALL_TABLES');

CREATE TABLE IF NOT EXISTS portal_announcements (
    id INT(11) AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    message TEXT NOT NULL,
    target_role ENUM('all', 'user', 'collector') NOT NULL DEFAULT 'all',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INT(11) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

ALTER TABLE users
  MODIFY role ENUM('admin', 'collector', 'user', 'petugas', 'administrator') DEFAULT 'user';
ALTER TABLE portal_announcements
  MODIFY target_role ENUM('all', 'user', 'collector', 'petugas') NOT NULL DEFAULT 'all';

START TRANSACTION;
UPDATE users SET role = 'petugas' WHERE role = 'collector';
UPDATE portal_announcements
  SET target_role = 'petugas', updated_at = updated_at
  WHERE target_role = 'collector';
COMMIT;

ALTER TABLE users
  MODIFY role ENUM('admin', 'user', 'petugas', 'administrator') DEFAULT 'user';
ALTER TABLE portal_announcements
  MODIFY target_role ENUM('all', 'user', 'petugas') NOT NULL DEFAULT 'all';

SET SESSION sql_mode = @previous_sql_mode;
