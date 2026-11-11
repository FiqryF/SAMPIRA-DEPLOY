package models

const (
	StatusPending   = "pending"
	StatusPickup    = "pickup"
	StatusTransit   = "transit"
	StatusArrived   = "arrived"
	StatusCompleted = "completed"
	StatusCancelled = "cancelled"
)

// PaymentStatus keeps operational history distinct from confirmation by a payment provider.
func PaymentStatus(pickupStatus string, legacyProcessed bool) string {
	switch {
	case legacyProcessed || pickupStatus == StatusCompleted:
		return "requires_reconciliation"
	case pickupStatus == StatusArrived:
		return "pending"
	default:
		return "not_due"
	}
}
