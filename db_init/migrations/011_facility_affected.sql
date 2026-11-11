CREATE TABLE IF NOT EXISTS facility_report_affected (
 report_id INT NOT NULL,
 user_id INT NOT NULL,
 confirmed_at DATETIME(6) NOT NULL,
 PRIMARY KEY (report_id,user_id),
 CONSTRAINT fk_affected_report FOREIGN KEY (report_id) REFERENCES facility_reports(id),
 CONSTRAINT fk_affected_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
