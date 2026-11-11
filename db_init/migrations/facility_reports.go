package migrations

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"strings"
)

//go:embed 002_facility_reports.sql
var facilityReportsDDL string

//go:embed 003_facility_handling.sql
var facilityHandlingDDL string

//go:embed 004_precise_locations.sql
var preciseLocationsDDL string

//go:embed 005_education_content.sql
var educationContentDDL string

//go:embed 006_pickup_idempotency.sql
var pickupIdempotencyDDL string

//go:embed 007_registration_unicode.sql
var registrationUnicodeDDL string

//go:embed 008_rewards_points_vouchers.sql
var contributionDDL string

func ApplyContributions(ctx context.Context, db *sql.DB) error {
	return applySQL(ctx, db, contributionDDL)
}

// ApplyFacilityReports runs additive, individually retryable DDL.
func ApplyFacilityReports(ctx context.Context, db *sql.DB) error {
	return applySQL(ctx, db, facilityReportsDDL)
}

func ApplyFacilityHandling(ctx context.Context, db *sql.DB) error {
	return applySQL(ctx, db, facilityHandlingDDL)
}

func ApplyPreciseLocations(ctx context.Context, db *sql.DB) error {
	return applySQL(ctx, db, preciseLocationsDDL)
}

func ApplyEducationContent(ctx context.Context, db *sql.DB) error {
	return applySQL(ctx, db, educationContentDDL)
}

func ApplyPickupIdempotency(ctx context.Context, db *sql.DB) error {
	return applySQL(ctx, db, pickupIdempotencyDDL)
}

func ApplyRegistrationUnicode(ctx context.Context, db *sql.DB) error {
	var ready int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME IN ('name','email')
		AND COLLATION_NAME='utf8mb4_unicode_ci'`).Scan(&ready)
	if err != nil || ready == 2 {
		return err
	}
	return applySQL(ctx, db, registrationUnicodeDDL)
}

func applySQL(ctx context.Context, db *sql.DB, ddl string) error {
	for i, statement := range strings.Split(ddl, ";") {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("migration statement %d: %w", i+1, err)
		}
	}
	return nil
}
