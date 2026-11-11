CREATE TABLE IF NOT EXISTS pickup_requests (
    user_id INT NOT NULL,
    request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    fingerprint BINARY(32) NOT NULL,
    pickup_id INT NOT NULL,
    response JSON NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    PRIMARY KEY (user_id, request_key),
    UNIQUE KEY uq_pickup_request_result (pickup_id),
    CONSTRAINT fk_pickup_request_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_pickup_request_pickup FOREIGN KEY (pickup_id) REFERENCES pickups(id) ON DELETE CASCADE
) ENGINE=InnoDB;
