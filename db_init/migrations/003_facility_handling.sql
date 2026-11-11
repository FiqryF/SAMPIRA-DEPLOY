CREATE TABLE IF NOT EXISTS facility_handling (
    report_id INT PRIMARY KEY,
    status ENUM('approved','assigned','assessment_in_progress','handling_in_progress','resolution_submitted','resolution_revision_required','completed') NOT NULL,
    version INT NOT NULL,
    coordination_status ENUM('not_forwarded','forwarded','receipt_confirmed','follow_up_reported','resolution_verified') NOT NULL,
    public_result VARCHAR(1000) NULL,
    public_evidence_version INT NULL,
    updated_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_handling_report FOREIGN KEY (report_id) REFERENCES facility_reports(id),
    CONSTRAINT chk_handling_version CHECK (version >= 0),
    CONSTRAINT chk_handling_public_result CHECK (
        (status = 'completed' AND public_result IS NOT NULL) OR
        (status <> 'completed' AND public_result IS NULL AND public_evidence_version IS NULL)
    ),
    CONSTRAINT chk_handling_coordination CHECK (coordination_status <> 'resolution_verified' OR status = 'completed'),
    KEY idx_handling_status (status, report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS facility_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_id INT NOT NULL,
    petugas_id INT NOT NULL,
    assigned_by INT NOT NULL,
    status ENUM('active','reassigned','completed') NOT NULL,
    assigned_at DATETIME(6) NOT NULL,
    ended_at DATETIME(6) NULL,
    active_report_id INT AS (CASE WHEN status = 'active' THEN report_id ELSE NULL END) PERSISTENT,
    UNIQUE KEY uq_handling_active_report (active_report_id),
    UNIQUE KEY uq_handling_report_assignment (report_id, id),
    KEY idx_handling_officer (petugas_id, status, report_id),
    CONSTRAINT fk_assignment_handling FOREIGN KEY (report_id) REFERENCES facility_handling(report_id),
    CONSTRAINT fk_assignment_petugas FOREIGN KEY (petugas_id) REFERENCES users(id),
    CONSTRAINT fk_assignment_admin FOREIGN KEY (assigned_by) REFERENCES users(id),
    CONSTRAINT chk_assignment_end CHECK (
        (status = 'active' AND ended_at IS NULL) OR (status <> 'active' AND ended_at IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS facility_handling_events (
    report_id INT NOT NULL,
    version INT NOT NULL,
    actor_id INT NOT NULL,
    assignment_id INT NULL,
    action VARCHAR(36) NOT NULL,
    from_status VARCHAR(32) NOT NULL,
    to_status VARCHAR(32) NOT NULL,
    public_note VARCHAR(1000) NULL,
    internal_note VARCHAR(1000) NULL,
    field_condition VARCHAR(1000) NULL,
    assessment VARCHAR(1000) NULL,
    action_taken VARCHAR(1000) NULL,
    result VARCHAR(1000) NULL,
    coordination_status VARCHAR(24) NULL,
    agency VARCHAR(160) NULL,
    channel VARCHAR(80) NULL,
    forwarded_at DATETIME(6) NULL,
    reference VARCHAR(120) NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (report_id, version),
    CONSTRAINT fk_handling_event_report FOREIGN KEY (report_id) REFERENCES facility_handling(report_id),
    CONSTRAINT fk_handling_event_actor FOREIGN KEY (actor_id) REFERENCES users(id),
    CONSTRAINT fk_handling_event_assignment FOREIGN KEY (report_id, assignment_id) REFERENCES facility_assignments(report_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS facility_handling_photos (
    report_id INT NOT NULL,
    version INT NOT NULL,
    content_type ENUM('image/jpeg','image/png') NOT NULL,
    content MEDIUMBLOB NOT NULL,
    PRIMARY KEY (report_id, version),
    CONSTRAINT fk_handling_photo_event FOREIGN KEY (report_id, version) REFERENCES facility_handling_events(report_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
