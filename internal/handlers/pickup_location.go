package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	httpx "ecorecycle/internal/middleware"
)

var pickupCoordinatePattern = regexp.MustCompile(`^-?[0-9]{1,3}(\.[0-9]{1,7})?$`)

type pickupLocation struct {
	provided  bool
	latitude  *float64
	longitude *float64
}

func parseCoordinatePair(latitude, longitude string, pattern *regexp.Regexp) (*float64, *float64, bool) {
	if latitude == "" && longitude == "" {
		return nil, nil, true
	}
	if !pattern.MatchString(latitude) || !pattern.MatchString(longitude) {
		return nil, nil, false
	}
	lat, latErr := strconv.ParseFloat(latitude, 64)
	lon, lonErr := strconv.ParseFloat(longitude, 64)
	if latErr != nil || lonErr != nil || lat < -90 || lat > 90 || lon < -180 || lon > 180 {
		return nil, nil, false
	}
	return &lat, &lon, true
}

func readPickupRequest(r *http.Request) (map[string]string, pickupLocation, *apiProblem) {
	invalid := &apiProblem{"Koordinat harus berupa pasangan latitude dan longitude yang valid, maksimal 7 angka desimal.", http.StatusBadRequest}
	var data map[string]string
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		var problem *apiProblem
		data, problem = readPickupJSON(r.Body, invalid)
		if problem != nil {
			return nil, pickupLocation{}, problem
		}
	} else {
		data = httpx.RequestData(r)
		for _, field := range []string{"latitude", "longitude"} {
			if len(r.PostForm[field]) > 1 || (r.MultipartForm != nil && len(r.MultipartForm.File[field]) != 0) {
				return nil, pickupLocation{}, invalid
			}
		}
	}

	lat, hasLat := data["latitude"]
	lon, hasLon := data["longitude"]
	latitude, longitude, valid := parseCoordinatePair(strings.TrimSpace(lat), strings.TrimSpace(lon), pickupCoordinatePattern)
	if hasLat != hasLon || !valid {
		return nil, pickupLocation{}, invalid
	}
	return data, pickupLocation{provided: hasLat, latitude: latitude, longitude: longitude}, nil
}

func readPickupJSON(body io.Reader, invalidCoordinates *apiProblem) (map[string]string, *apiProblem) {
	invalidBody := &apiProblem{"Body pengajuan tidak valid.", http.StatusBadRequest}
	decoder := json.NewDecoder(body)
	decoder.UseNumber()
	token, err := decoder.Token()
	if err != nil || token != json.Delim('{') {
		return nil, invalidBody
	}
	data := make(map[string]string)
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return nil, invalidBody
		}
		key := keyToken.(string)
		var value any
		if decoder.Decode(&value) != nil {
			return nil, invalidBody
		}
		if problem := pickupJSONValue(data, key, value, invalidCoordinates, invalidBody); problem != nil {
			return nil, problem
		}
	}
	if _, err := decoder.Token(); err != nil || decoder.Decode(new(json.RawMessage)) != io.EOF {
		return nil, invalidBody
	}
	return data, nil
}

func pickupJSONValue(data map[string]string, key string, value any, invalidCoordinates, invalidBody *apiProblem) *apiProblem {
	if key == "latitude" || key == "longitude" {
		if _, exists := data[key]; exists {
			return invalidCoordinates
		}
		switch v := value.(type) {
		case string:
			data[key] = v
		case json.Number:
			data[key] = v.String()
		case nil:
			data[key] = ""
		default:
			return invalidCoordinates
		}
		return nil
	}

	if key == "items" {
		if _, exists := data[key]; exists {
			return invalidBody
		}
		if array, ok := value.([]any); ok {
			raw, _ := json.Marshal(array)
			data[key] = string(raw)
			return nil
		}
	}
	// Preserve the legacy scalar conversions for the other pickup fields.
	switch v := value.(type) {
	case string:
		data[key] = v
	case json.Number:
		number, err := v.Float64()
		if err != nil {
			return invalidBody
		}
		data[key] = fmt.Sprintf("%g", number)
	case bool:
		data[key] = strconv.FormatBool(v)
	default:
		delete(data, key)
	}
	return nil
}
