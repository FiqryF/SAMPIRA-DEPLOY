package repositories

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"ecorecycle/internal/models"
)

var ErrEducationConflict = errors.New("education article version or status conflict")

type Education struct {
	DB *sql.DB
}

type EducationFilter struct {
	Category string
	Search   string
	Status   string
	Page     int
	Limit    int
}

const educationSummaryColumns = "id, slug, title, summary, category, published_at, photos_json"
const educationBodyColumns = ", body, source_urls"
const educationAuditColumns = ", status, version, created_by, updated_by, created_at, updated_at"

const educationSelectPrefix = "SELECT "

func educationSummaryFields(item *models.EducationSummary) []any {
	return []any{&item.ID, &item.Slug, &item.Title, &item.Summary, &item.Category, &item.PublishedAt, &item.Photos}
}

func educationAuditFields(item *models.EducationAudit) []any {
	return []any{&item.Status, &item.Version, &item.CreatedBy, &item.UpdatedBy, &item.CreatedAt, &item.UpdatedAt}
}

var educationLikeEscaper = strings.NewReplacer("!", "!!", "%", "!%", "_", "!_")

func educationListQuery(filter EducationFilter, public bool) (string, []any) {
	columns := educationSummaryColumns
	order := "id DESC"
	where := []string{}
	args := []any{}
	if public {
		where = append(where, "status = 'published'")
		order = "published_at DESC, id DESC"
	} else {
		columns += educationAuditColumns
		if filter.Status != "" {
			where = append(where, "status = ?")
			args = append(args, filter.Status)
		}
	}
	if filter.Category != "" {
		where = append(where, "category = ?")
		args = append(args, filter.Category)
	}
	if filter.Search != "" {
		pattern := "%" + educationLikeEscaper.Replace(filter.Search) + "%"
		where = append(where, "(title LIKE ? ESCAPE '!' OR summary LIKE ? ESCAPE '!')")
		args = append(args, pattern, pattern)
	}
	query := educationSelectPrefix + columns + " FROM education_articles"
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	return query + " ORDER BY " + order + " LIMIT ? OFFSET ?", append(args, filter.Limit+1, (filter.Page-1)*filter.Limit)
}

func readEducationList[T any](ctx context.Context, db *sql.DB, filter EducationFilter, public bool, fields func(*T) []any) ([]T, bool, error) {
	query, args := educationListQuery(filter, public)
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	items := make([]T, 0, filter.Limit+1)
	for rows.Next() {
		var item T
		if err := rows.Scan(fields(&item)...); err != nil {
			return nil, false, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	if len(items) > filter.Limit {
		return items[:filter.Limit], true, nil
	}
	return items, false, nil
}

func (r Education) ListPublished(ctx context.Context, filter EducationFilter) ([]models.EducationSummary, bool, error) {
	return readEducationList(ctx, r.DB, filter, true, educationSummaryFields)
}

func (r Education) ListManaged(ctx context.Context, filter EducationFilter) ([]models.EducationManagedSummary, bool, error) {
	return readEducationList(ctx, r.DB, filter, false, func(item *models.EducationManagedSummary) []any {
		return append(educationSummaryFields(&item.EducationSummary), educationAuditFields(&item.EducationAudit)...)
	})
}

func (r Education) Published(ctx context.Context, slug string) (models.EducationArticle, error) {
	var item models.EducationArticle
	var sources []byte
	row := r.DB.QueryRowContext(ctx, educationSelectPrefix+educationSummaryColumns+educationBodyColumns+
		" FROM education_articles WHERE slug = ? AND status = 'published'", slug)
	if err := row.Scan(append(educationSummaryFields(&item.EducationSummary), &item.Body, &sources)...); err != nil {
		return item, err
	}
	err := json.Unmarshal(sources, &item.Sources)
	return item, err
}

type educationQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func managedEducation(ctx context.Context, db educationQueryer, id int) (models.EducationManagedArticle, error) {
	var item models.EducationManagedArticle
	var sources []byte
	row := db.QueryRowContext(ctx, educationSelectPrefix+educationSummaryColumns+educationBodyColumns+educationAuditColumns+
		" FROM education_articles WHERE id = ?", id)
	fields := append(educationSummaryFields(&item.EducationSummary), &item.Body, &sources)
	if err := row.Scan(append(fields, educationAuditFields(&item.EducationAudit)...)...); err != nil {
		return item, err
	}
	err := json.Unmarshal(sources, &item.Sources)
	return item, err
}

func (r Education) Managed(ctx context.Context, id int) (models.EducationManagedArticle, error) {
	return managedEducation(ctx, r.DB, id)
}

func (r Education) Create(ctx context.Context, input models.EducationInput, actorID int) (models.EducationManagedArticle, error) {
	sources, err := json.Marshal(input.Sources)
	if err != nil {
		return models.EducationManagedArticle{}, err
	}
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return models.EducationManagedArticle{}, err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `INSERT INTO education_articles
		(slug, title, summary, body, category, source_urls, created_by, updated_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, input.Slug, input.Title, input.Summary, input.Body, input.Category, sources, actorID, actorID)
	if err != nil {
		return models.EducationManagedArticle{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return models.EducationManagedArticle{}, err
	}
	item, err := managedEducation(ctx, tx, int(id))
	if err != nil {
		return item, err
	}
	return item, tx.Commit()
}

func (r Education) Edit(ctx context.Context, id, version, actorID int, input models.EducationInput) (models.EducationManagedArticle, error) {
	sources, err := json.Marshal(input.Sources)
	if err != nil {
		return models.EducationManagedArticle{}, err
	}
	return r.update(ctx, id, `UPDATE education_articles
		SET slug = ?, title = ?, summary = ?, body = ?, category = ?, source_urls = ?,
		    updated_by = ?, updated_at = UTC_TIMESTAMP(6), version = version + 1
		WHERE id = ? AND version = ? AND status = 'draft'`,
		input.Slug, input.Title, input.Summary, input.Body, input.Category, sources, actorID, id, version)
}

func (r Education) SetPublication(ctx context.Context, id, version, actorID int, status string) (models.EducationManagedArticle, error) {
	switch status {
	case models.EducationPublished:
		return r.update(ctx, id, `UPDATE education_articles
			SET status = 'published', published_at = UTC_TIMESTAMP(6), updated_by = ?,
			    updated_at = UTC_TIMESTAMP(6), version = version + 1
			WHERE id = ? AND version = ? AND status = 'draft'`, actorID, id, version)
	case models.EducationArchived:
		return r.update(ctx, id, `UPDATE education_articles
			SET status = 'archived', updated_by = ?, updated_at = UTC_TIMESTAMP(6), version = version + 1
			WHERE id = ? AND version = ? AND status IN ('draft', 'published')`, actorID, id, version)
	default:
		return models.EducationManagedArticle{}, ErrEducationConflict
	}
}

func (r Education) update(ctx context.Context, id int, query string, args ...any) (models.EducationManagedArticle, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return models.EducationManagedArticle{}, err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, query, args...)
	if err != nil {
		return models.EducationManagedArticle{}, err
	}
	count, err := res.RowsAffected()
	if err != nil {
		return models.EducationManagedArticle{}, err
	}
	item, err := managedEducation(ctx, tx, id)
	if err != nil {
		return item, err
	}
	if count == 0 {
		return models.EducationManagedArticle{}, ErrEducationConflict
	}
	return item, tx.Commit()
}
