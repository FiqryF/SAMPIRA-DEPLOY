package handlers

import "math"

// Prices and weights are already quantized to two decimals. Integer hundredths avoid float money arithmetic.
func rewardValue(rate, weight float64) float64 {
	rateCents := int64(math.Round(rate * 100))
	weightHundredths := int64(math.Round(weight * 100))
	return float64((rateCents*weightHundredths+50)/100) / 100
}

func netReward(gross, fee float64) float64 {
	return math.Max(0, math.Round((gross-fee)*100)/100)
}
