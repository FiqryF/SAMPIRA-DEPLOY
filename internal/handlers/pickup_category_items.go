package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
)

// Prices and totals are always filled by the server, never accepted from the client.
type pickupCategoryItem struct {
	Category    string   `json:"category"`
	Weight      float64  `json:"weight_kg"`
	Reward      float64  `json:"eco_reward"`
	Fee         float64  `json:"processing_fee"`
	FinalWeight *float64 `json:"final_weight_kg,omitempty"`
	FinalReward *float64 `json:"final_eco_reward,omitempty"`
	FinalFee    *float64 `json:"final_processing_fee,omitempty"`
}

type categoryQuery interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func pricePickupItems(ctx context.Context, db categoryQuery, raw string) ([]pickupCategoryItem, int, float64, float64, float64, error) {
	var input []struct {
		Category string  `json:"category"`
		Weight   float64 `json:"weight_kg"`
	}
	if len(raw) > 12000 || json.Unmarshal([]byte(raw), &input) != nil || len(input) == 0 || len(input) > 20 {
		return nil, 0, 0, 0, 0, errors.New("Pilih 1–20 kategori dan isi berat tiap kategori.")
	}
	sort.Slice(input, func(i, j int) bool { return input[i].Category < input[j].Category })
	items := make([]pickupCategoryItem, 0, len(input))
	seen := map[string]bool{}
	seenIDs := map[int]bool{}
	var first int
	var total, reward, fee float64
	for _, row := range input {
		row.Category = strings.TrimSpace(row.Category)
		if seen[row.Category] {
			return nil, 0, 0, 0, 0, errors.New("Kategori yang sama tidak boleh diulang.")
		}
		seen[row.Category] = true
		weight, err := pickupWeight(strconv.FormatFloat(row.Weight, 'f', -1, 64))
		if err != nil {
			return nil, 0, 0, 0, 0, errors.New("Berat tiap kategori harus positif dengan maksimal dua desimal.")
		}
		var id int
		var rate, cost float64
		err = db.QueryRowContext(ctx, "SELECT id,reward_per_kg,processing_fee_per_kg FROM waste_categories WHERE category_name=?", row.Category).Scan(&id, &rate, &cost)
		if err == sql.ErrNoRows {
			return nil, 0, 0, 0, 0, errors.New("Kategori sampah tidak ditemukan.")
		}
		if err != nil {
			return nil, 0, 0, 0, 0, errors.New("Rincian kategori belum dapat dihitung.")
		}
		if seenIDs[id] {
			return nil, 0, 0, 0, 0, errors.New("Kategori yang sama tidak boleh diulang.")
		}
		seenIDs[id] = true
		first = firstPickupCategory(first, id)
		item := pickupCategoryItem{Category: row.Category, Weight: weight, Reward: rewardValue(rate, weight), Fee: rewardValue(cost, weight)}
		items = append(items, item)
		total += weight
		reward += item.Reward
		fee += item.Fee
	}
	total = math.Round(total*100) / 100
	if total > 99999.99 {
		return nil, 0, 0, 0, 0, errors.New("Total berat maksimal 99999,99 kg.")
	}
	return items, first, total, math.Round(reward*100) / 100, math.Round(fee*100) / 100, nil
}

func encodePickupItems(items []pickupCategoryItem) string {
	raw, _ := json.Marshal(items)
	return string(raw)
}

func applyPickupItems(item map[string]interface{}, raw sql.NullString) error {
	if !raw.Valid || raw.String == "" {
		return nil
	}
	var rows []pickupCategoryItem
	if err := json.Unmarshal([]byte(raw.String), &rows); err != nil {
		return err
	}
	names := make([]string, 0, len(rows))
	for _, row := range rows {
		names = append(names, row.Category)
	}
	item["items"] = rows
	item["category_name"] = strings.Join(names, ", ")
	return nil
}

func verifyPickupItems(ctx context.Context, tx *sql.Tx, raw sql.NullString, submitted string, total float64) (string, float64, float64, error) {
	if !raw.Valid || raw.String == "" {
		return "", 0, 0, nil
	}
	var saved []pickupCategoryItem
	if err := json.Unmarshal([]byte(raw.String), &saved); err != nil {
		return "", 0, 0, err
	}
	var actual []actualPickupWeight
	if len(submitted) > 12000 || json.Unmarshal([]byte(submitted), &actual) != nil || len(actual) != len(saved) {
		return "", 0, 0, errors.New("Isi berat aktual untuk setiap kategori yang diajukan.")
	}
	weights, err := actualPickupWeights(actual)
	if err != nil {
		return "", 0, 0, err
	}
	var sum, reward, fee float64
	for i := range saved {
		value, ok := weights[saved[i].Category]
		if !ok {
			return "", 0, 0, errors.New("Kategori aktual tidak sesuai pengajuan.")
		}
		w, err := pickupWeight(fmt.Sprintf("%g", value))
		if err != nil {
			return "", 0, 0, errors.New("Berat aktual tiap kategori harus positif, maksimal dua desimal.")
		}
		var rate, cost float64
		if err = tx.QueryRowContext(ctx, "SELECT reward_per_kg,processing_fee_per_kg FROM waste_categories WHERE category_name=?", saved[i].Category).Scan(&rate, &cost); err != nil {
			return "", 0, 0, err
		}
		r, f := rewardValue(rate, w), rewardValue(cost, w)
		saved[i].FinalWeight = &w
		saved[i].FinalReward = &r
		saved[i].FinalFee = &f
		sum += w
		reward += r
		fee += f
	}
	if math.Abs(sum-total) > .001 {
		return "", 0, 0, errors.New("Total berat aktual harus sama dengan jumlah berat tiap kategori.")
	}
	return encodePickupItems(saved), math.Round(reward*100) / 100, math.Round(fee*100) / 100, nil
}

func (a *App) priceRequestItems(r *http.Request, data map[string]string) ([]pickupCategoryItem, int, float64, float64, float64, error) {
	items, id, weight, reward, fee, err := pricePickupItems(r.Context(), a.DB, data["items"])
	if err != nil {
		return nil, 0, 0, 0, 0, err
	}
	// Canonical client data participates in idempotency; do not change legacy fingerprints.
	input := make([]map[string]any, 0, len(items))
	for _, item := range items {
		input = append(input, map[string]any{"category": item.Category, "weight_kg": item.Weight})
	}
	canonical, _ := json.Marshal(input)
	data["items"] = string(canonical)
	return items, id, weight, reward, fee, nil
}

func firstPickupCategory(current, next int) int {
	if current == 0 {
		return next
	}
	return current
}

type actualPickupWeight struct {
	Category string  `json:"category"`
	Weight   float64 `json:"weight_kg"`
}

func actualPickupWeights(actual []actualPickupWeight) (map[string]float64, error) {
	weights := map[string]float64{}
	for _, row := range actual {
		if _, ok := weights[row.Category]; ok {
			return nil, errors.New("Kategori aktual berulang.")
		}
		weights[row.Category] = row.Weight
	}

	return weights, nil
}
