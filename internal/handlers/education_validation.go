package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"ecorecycle/internal/models"
	"ecorecycle/internal/repositories"
)

const educationBodyLimit = 192 << 10
const educationMaxPage = 1000
const educationMaxLimit = 50
const educationMaxVersion = 2147483647

var educationSlug = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

func validEducationSlug(slug string) bool {
	return len(slug) >= 3 && len(slug) <= 120 && educationSlug.MatchString(slug)
}

func educationText(value string, minLength, maxLength int, multiline bool) bool {
	length := utf8.RuneCountInString(value)
	if length < minLength || length > maxLength || strings.ContainsAny(value, "<>") {
		return false
	}
	for _, char := range value {
		if unicode.IsControl(char) && !(multiline && (char == '\n' || char == '\r' || char == '\t')) {
			return false
		}
	}
	return true
}

func validateEducationInput(input *models.EducationInput) *apiProblem {
	input.Slug = strings.TrimSpace(input.Slug)
	input.Title = strings.TrimSpace(input.Title)
	input.Summary = strings.TrimSpace(input.Summary)
	input.Body = strings.TrimSpace(input.Body)
	input.Category = strings.TrimSpace(input.Category)
	if !validEducationSlug(input.Slug) {
		return &apiProblem{"Slug harus 3–120 karakter berupa huruf kecil, angka, dan tanda hubung antarbagian.", http.StatusBadRequest}
	}
	if !models.ValidEducationCategory(input.Category) {
		return &apiProblem{"Kategori edukasi tidak valid.", http.StatusBadRequest}
	}
	if !educationText(input.Title, 3, 120, false) || !educationText(input.Summary, 10, 320, false) || !educationText(input.Body, 20, 12000, true) {
		return &apiProblem{"Gunakan teks biasa tanpa markup. Judul 3–120, ringkasan 10–320, dan isi 20–12.000 karakter.", http.StatusBadRequest}
	}
	if input.Sources == nil {
		input.Sources = []string{}
	}
	if len(input.Sources) > 8 {
		return &apiProblem{"Sertakan maksimal delapan URL sumber HTTPS.", http.StatusBadRequest}
	}
	for i, raw := range input.Sources {
		raw = strings.TrimSpace(raw)
		source, err := url.Parse(raw)
		if err != nil || !educationText(raw, 1, 2048, false) || strings.ContainsAny(raw, " \\") ||
			source.Scheme != "https" || source.Hostname() == "" || source.User != nil {
			return &apiProblem{"Setiap sumber harus berupa URL HTTPS yang valid tanpa kredensial.", http.StatusBadRequest}
		}
		input.Sources[i] = raw
	}
	return nil
}

func readEducationJSON(w http.ResponseWriter, r *http.Request, input any) *apiProblem {
	if r.URL.RawQuery != "" {
		return &apiProblem{"Kirim field artikel melalui body.", http.StatusBadRequest}
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return &apiProblem{"Content-Type harus application/json.", http.StatusUnsupportedMediaType}
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, educationBodyLimit))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		return &apiProblem{"Ukuran body artikel melebihi batas.", http.StatusRequestEntityTooLarge}
	}
	body = bytes.TrimSpace(body)
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err != nil || len(body) == 0 || body[0] != '{' || !utf8.Valid(body) ||
		decoder.Decode(input) != nil || decoder.Decode(new(json.RawMessage)) != io.EOF {
		return &apiProblem{"Body JSON artikel tidak valid atau memuat field yang tidak diizinkan.", http.StatusBadRequest}
	}
	return nil
}

func readEducationFilter(rawQuery string, managed bool) (repositories.EducationFilter, bool) {
	filter := repositories.EducationFilter{Page: 1, Limit: 20}
	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		return filter, false
	}
	for key, entries := range values {
		if len(entries) != 1 {
			return filter, false
		}
		value := strings.TrimSpace(entries[0])
		switch key {
		case "category":
			if !models.ValidEducationCategory(value) {
				return filter, false
			}
			filter.Category = value
		case "q":
			if !utf8.ValidString(value) || !educationText(value, 1, 100, false) {
				return filter, false
			}
			filter.Search = value
		case "status":
			if !managed || (value != models.EducationDraft && value != models.EducationPublished && value != models.EducationArchived) {
				return filter, false
			}
			filter.Status = value
		case "page", "limit":
			number, err := strconv.Atoi(value)
			if err != nil || number < 1 || (key == "page" && number > educationMaxPage) || (key == "limit" && number > educationMaxLimit) {
				return filter, false
			}
			if key == "page" {
				filter.Page = number
			} else {
				filter.Limit = number
			}
		default:
			return filter, false
		}
	}
	return filter, true
}
