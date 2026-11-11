package repositories

import (
	"context"
	"database/sql"
	"ecorecycle/internal/models"
	"encoding/json"
	"errors"
	"strconv"
)

type EducationPhotoUpload struct {
	models.EducationPhoto
	Data []byte
	MIME string
	Keep bool
}

// Photo changes share the draft's optimistic version lock and commit atomically.
func (r Education) SavePhotos(ctx context.Context, id, version, actorID int, uploads []EducationPhotoUpload) (models.EducationManagedArticle, error) {
	var empty models.EducationManagedArticle
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return empty, err
	}
	defer tx.Rollback()
	var current int
	var status string
	if err = tx.QueryRowContext(ctx, "SELECT version,status FROM education_articles WHERE id=? FOR UPDATE", id).Scan(&current, &status); err != nil {
		return empty, err
	}
	if current != version || status != "draft" {
		return empty, ErrEducationConflict
	}
	photos := models.EducationPhotos{}
	for i, upload := range uploads {
		photo, err := saveEducationPhoto(ctx, tx, id, version, i, upload)
		if err != nil {
			return empty, err
		}
		if photo.URL != "" {
			photos = append(photos, photo)
		}
	}

	raw, err := json.Marshal(photos)
	if err != nil {
		return empty, err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE education_articles SET photos_json=?,updated_by=?,updated_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=?", raw, actorID, id); err != nil {
		return empty, err
	}
	item, err := managedEducation(ctx, tx, id)
	if err != nil {
		return empty, err
	}
	return item, tx.Commit()
}

// Draft/archived uploads must never become public through a direct media URL.
func (r Education) Photo(ctx context.Context, id, position int, admin bool) ([]byte, string, error) {
	var data []byte
	var mime string
	err := r.DB.QueryRowContext(ctx, `SELECT p.photo_data,p.mime_type FROM education_article_photos p JOIN education_articles a ON a.id=p.article_id WHERE p.article_id=? AND p.position=? AND (a.status='published' OR ?=TRUE)`, id, position, admin).Scan(&data, &mime)
	return data, mime, err
}

var ErrEducationPhotoCapacity = errors.New("education photo storage capacity exceeded")

func saveEducationPhoto(ctx context.Context, tx *sql.Tx, id, version, position int, upload EducationPhotoUpload) (models.EducationPhoto, error) {
	var err error
	if upload.Keep {
		if err = tx.QueryRowContext(ctx, "SELECT photo_data,mime_type FROM education_article_photos WHERE article_id=? AND position=?", id, position).Scan(&upload.Data, &upload.MIME); err != nil {
			return models.EducationPhoto{}, err
		}
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM education_article_photos WHERE article_id=? AND position=?", id, position); err != nil {
		return models.EducationPhoto{}, err
	}
	if len(upload.Data) > 0 {
		var packet int64
		if err = tx.QueryRowContext(ctx, "SELECT @@max_allowed_packet").Scan(&packet); err != nil {
			return models.EducationPhoto{}, err
		}
		if int64(len(upload.Data)) > packet-(64<<10) {
			return models.EducationPhoto{}, ErrEducationPhotoCapacity
		}
		if _, err = tx.ExecContext(ctx, "INSERT INTO education_article_photos(article_id,position,photo_data,mime_type) VALUES(?,?,?,?)", id, position, upload.Data, upload.MIME); err != nil {
			return models.EducationPhoto{}, err
		}
		upload.URL = "/api/ecorecycle/education/media/" + strconv.Itoa(id) + "/" + strconv.Itoa(position) + "?v=" + strconv.Itoa(version+1)
	}
	return upload.EducationPhoto, nil
}
