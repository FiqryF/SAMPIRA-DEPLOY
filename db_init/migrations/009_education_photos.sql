ALTER TABLE education_articles ADD COLUMN IF NOT EXISTS photos_json LONGTEXT NULL;
CREATE TABLE IF NOT EXISTS education_article_photos (
    article_id INT NOT NULL,
    position TINYINT NOT NULL,
    photo_data MEDIUMBLOB NOT NULL,
    mime_type VARCHAR(32) NOT NULL,
    PRIMARY KEY (article_id, position),
    CONSTRAINT fk_education_photo_article FOREIGN KEY (article_id) REFERENCES education_articles(id) ON DELETE CASCADE,
    CONSTRAINT chk_education_photo_position CHECK (position IN (0,1))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
