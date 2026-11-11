CREATE TABLE IF NOT EXISTS facility_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tracking_number CHAR(28) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reporter_id INT NOT NULL,
    request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    category ENUM('tps','collection_site','waste_bank','other') NOT NULL,
    title VARCHAR(120) NOT NULL,
    description TEXT NOT NULL,
    address VARCHAR(300) NOT NULL,
    latitude DECIMAL(8,6) DEFAULT NULL,
    longitude DECIMAL(9,6) DEFAULT NULL,
    status ENUM('pending','revision_required','approved','rejected') NOT NULL,
    version INT NOT NULL,
    reviewed_by INT DEFAULT NULL,
    reviewed_at DATETIME(6) DEFAULT NULL,
    verification_note VARCHAR(1000) DEFAULT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    UNIQUE KEY uq_facility_tracking (tracking_number),
    UNIQUE KEY uq_facility_request (reporter_id, request_key),
    KEY idx_facility_reporter (reporter_id, id),
    KEY idx_facility_status (status, id),
    KEY idx_facility_category (category, id),
    CONSTRAINT fk_facility_reporter FOREIGN KEY (reporter_id) REFERENCES users(id),
    CONSTRAINT fk_facility_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id),
    CONSTRAINT chk_facility_coordinates CHECK (
        (latitude IS NULL AND longitude IS NULL) OR
        (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS facility_report_photos (
    report_id INT PRIMARY KEY,
    content_type ENUM('image/jpeg','image/png') NOT NULL,
    content MEDIUMBLOB NOT NULL,
    CONSTRAINT fk_facility_photo_report FOREIGN KEY (report_id) REFERENCES facility_reports(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS facility_report_history (
    report_id INT NOT NULL,
    version INT NOT NULL,
    actor_id INT NOT NULL,
    from_status ENUM('pending','revision_required','approved','rejected') DEFAULT NULL,
    to_status ENUM('pending','revision_required','approved','rejected') NOT NULL,
    note VARCHAR(1000) DEFAULT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (report_id, version),
    CONSTRAINT fk_facility_history_report FOREIGN KEY (report_id) REFERENCES facility_reports(id),
    CONSTRAINT fk_facility_history_actor FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
