package handlers

import (
	"database/sql"
	"time"

	"ecorecycle/internal/models"
)

func scanPickupListRow(rows *sql.Rows, queryType string) (map[string]interface{}, error) {
	var id int
	var userID int
	var collectorID *int
	var trackingNumber string
	var itemDesc *string
	var pickupAddress *string
	var latitude, longitude *float64
	var contactPhone *string
	var weightKg *float64
	var categoryID *int
	var ecoReward *float64
	var processingFee *float64
	var photoURL *string
	var isProcessed bool
	var status string
	var createdAt time.Time
	var finalWeightKg *float64
	var finalEcoReward *float64
	var finalProcessingFee *float64
	var verificationNotes *string
	var verifiedAt *time.Time
	var categoryName *string
	var donorName *string
	var paymentStatus *string
	var rewardAmount *string
	var hasLegacyTransaction bool

	var scanErr error
	if queryType == models.RoleUser {
		scanErr = rows.Scan(&id, &userID, &collectorID, &trackingNumber, &itemDesc, &pickupAddress, &contactPhone, &weightKg, &categoryID, &ecoReward, &processingFee, &photoURL, &isProcessed, &status, &createdAt, &finalWeightKg, &finalEcoReward, &finalProcessingFee, &verificationNotes, &verifiedAt, &categoryName, &paymentStatus, &rewardAmount, &hasLegacyTransaction, &latitude, &longitude)
	} else {
		scanErr = rows.Scan(&id, &userID, &collectorID, &trackingNumber, &itemDesc, &pickupAddress, &contactPhone, &weightKg, &categoryID, &ecoReward, &processingFee, &photoURL, &isProcessed, &status, &createdAt, &finalWeightKg, &finalEcoReward, &finalProcessingFee, &verificationNotes, &verifiedAt, &categoryName, &paymentStatus, &rewardAmount, &hasLegacyTransaction, &latitude, &longitude, &donorName)
	}

	if scanErr != nil {
		return nil, scanErr
	}
	item := map[string]interface{}{
		"id":                   id,
		"user_id":              userID,
		"collector_id":         collectorID,
		"tracking_number":      trackingNumber,
		"item_description":     itemDesc,
		"pickup_address":       pickupAddress,
		"latitude":             latitude,
		"longitude":            longitude,
		"contact_phone":        contactPhone,
		"weight_kg":            weightKg,
		"category_id":          categoryID,
		"eco_reward":           ecoReward,
		"processing_fee":       processingFee,
		"photo_url":            photoURL,
		"is_processed":         isProcessed,
		"payment_status":       models.PaymentStatus(status, isProcessed),
		"status":               status,
		"created_at":           createdAt,
		"final_weight_kg":      finalWeightKg,
		"final_eco_reward":     finalEcoReward,
		"final_processing_fee": finalProcessingFee,
		"verification_notes":   verificationNotes,
		"verified_at":          verifiedAt,
		"category_name":        categoryName,
	}
	if paymentStatus != nil {
		item["payment_status"] = *paymentStatus
	} else if verifiedAt != nil || hasLegacyTransaction {
		item["payment_status"] = "requires_reconciliation"
	}
	item["reward_amount"] = rewardAmount
	item["donor_name"] = optionalString(donorName)
	item["collector_name"] = ""
	item["payout_method"] = ""
	item["payout_account_name"] = ""
	item["payout_account_number"] = ""
	if queryType == models.RolePetugas && collectorID == nil {
		item["user_id"] = nil
	}
	return item, nil
}
