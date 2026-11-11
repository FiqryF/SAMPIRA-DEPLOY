CREATE TABLE IF NOT EXISTS contribution_rules (
 id INT PRIMARY KEY CHECK (id=1),
 points_per_kg INT NOT NULL CHECK (points_per_kg BETWEEN 0 AND 1000),
 description VARCHAR(300) NOT NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO contribution_rules VALUES (1,10,'Poin demonstrasi: floor(berat aktual kg * 10), sekali saat verifikasi pickup. Tidak dapat diuangkan. Berlaku prospektif.');
CREATE TABLE IF NOT EXISTS point_wallets (
 user_id INT PRIMARY KEY,
 balance BIGINT NOT NULL DEFAULT 0 CHECK (balance>=0),
 lifetime BIGINT NOT NULL DEFAULT 0 CHECK (lifetime>=balance),
 FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS point_entries (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 source_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 amount BIGINT NOT NULL CHECK (amount<>0),
 balance_after BIGINT NOT NULL CHECK (balance_after>=0),
 description VARCHAR(300) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_point_source (source_key),
 KEY idx_point_owner(user_id,id),
 FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS voucher_catalog (
 id INT AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(120) NOT NULL,
 description VARCHAR(1000) NOT NULL,
 category VARCHAR(60) NOT NULL,
 point_cost BIGINT NOT NULL CHECK (point_cost BETWEEN 1 AND 1000000000),
 stock INT NOT NULL CHECK (stock>=0),
 valid_from DATETIME NOT NULL,
 valid_until DATETIME NOT NULL,
 active BOOLEAN NOT NULL,
 version INT NOT NULL DEFAULT 1,
 simulation BOOLEAN NOT NULL DEFAULT TRUE CHECK (simulation=TRUE),
 CHECK (valid_until>valid_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS voucher_redemptions (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 voucher_id INT NOT NULL,
 request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 code CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 point_cost BIGINT NOT NULL,
 name VARCHAR(120) NOT NULL,
 description VARCHAR(1000) NOT NULL,
 valid_until DATETIME NOT NULL,
 simulation BOOLEAN NOT NULL DEFAULT TRUE CHECK (simulation=TRUE),
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_redemption_retry(user_id,request_key),
 KEY idx_redemption_owner(user_id,id),
 FOREIGN KEY (user_id) REFERENCES users(id),
 FOREIGN KEY (voucher_id) REFERENCES voucher_catalog(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phase9_audit (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 actor_id INT NOT NULL,
 action VARCHAR(40) NOT NULL,
 entity_id BIGINT NOT NULL,
 details TEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS cash_reward_events (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 pickup_id INT NOT NULL,
 event ENUM('accrual','void') NOT NULL,
 amount DECIMAL(15,2) NOT NULL,
 actor_id INT NOT NULL,
 reason VARCHAR(1000) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_cash_event(pickup_id,event),
 FOREIGN KEY (pickup_id) REFERENCES pickups(id),
 FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
