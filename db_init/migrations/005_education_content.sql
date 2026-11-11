CREATE TABLE IF NOT EXISTS education_articles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(120) NOT NULL,
    summary VARCHAR(320) NOT NULL,
    body TEXT NOT NULL,
    category ENUM('pemilahan-sampah', 'pengurangan-sampah', 'daur-ulang', 'pengomposan', 'bank-sampah', 'sampah-elektronik', 'panduan-sampira') NOT NULL,
    status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    source_urls JSON NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_by INT NOT NULL,
    updated_by INT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    published_at DATETIME(6) NULL,
    UNIQUE KEY uq_education_slug (slug),
    KEY idx_education_status_publication (status, published_at, id),
    KEY idx_education_category_publication (category, status, published_at, id),
    CONSTRAINT fk_education_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_education_editor FOREIGN KEY (updated_by) REFERENCES users(id),
    CONSTRAINT chk_education_version CHECK (version > 0),
    CONSTRAINT chk_education_publication CHECK (
        (status = 'draft' AND published_at IS NULL) OR
        (status = 'published' AND published_at IS NOT NULL) OR status = 'archived'
    )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
