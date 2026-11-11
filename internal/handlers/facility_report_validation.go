package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	"ecorecycle/internal/models"
)

const (
	facilityFormLimit         = 6 << 20
	facilityVerificationLimit = 16 << 10
	facilityImagePixels       = 16_000_000
)

var facilityRequestKey = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
var facilityCoordinatePattern = regexp.MustCompile(`^-?[0-9]{1,3}(\.[0-9]{1,6})?$`)

func facilityTextLength(text string, min, max int) bool {
	size := utf8.RuneCountInString(text)
	return utf8.ValidString(text) && !strings.ContainsRune(text, 0) && size >= min && size <= max
}

func parseFacilityCoordinates(latitude, longitude string) (*float64, *float64, bool) {
	return parseCoordinatePair(latitude, longitude, facilityCoordinatePattern)
}

func facilityBody(r *http.Request, mediaType string) *apiProblem {
	if r.URL.RawQuery != "" {
		return &apiProblem{"Kirim field laporan melalui body.", http.StatusBadRequest}
	}
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != mediaType {
		return &apiProblem{"Content-Type harus " + mediaType + ".", http.StatusUnsupportedMediaType}
	}
	return nil
}

func facilityBodyError(err error) *apiProblem {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		return &apiProblem{"Ukuran body laporan melebihi batas.", http.StatusRequestEntityTooLarge}
	}
	return &apiProblem{"Body laporan tidak valid.", http.StatusBadRequest}
}

func readFacilityForm(w http.ResponseWriter, r *http.Request, revision bool) (models.FacilityReportInput, int, *apiProblem) {
	var input models.FacilityReportInput
	if problem := facilityBody(r, "multipart/form-data"); problem != nil {
		return input, 0, problem
	}
	r.Body = http.MaxBytesReader(w, r.Body, facilityFormLimit)
	if err := r.ParseMultipartForm(facilityFormLimit); err != nil {
		return input, 0, facilityBodyError(err)
	}
	defer r.MultipartForm.RemoveAll()
	values := url.Values(r.MultipartForm.Value)
	for key, fields := range values {
		switch key {
		case "category", "title", "description", "address", "latitude", "longitude":
		case "version":
			if !revision {
				return input, 0, &apiProblem{"Field version hanya untuk revisi.", http.StatusBadRequest}
			}
		default:
			return input, 0, &apiProblem{"Field formulir laporan tidak diizinkan.", http.StatusBadRequest}
		}
		if len(fields) != 1 {
			return input, 0, &apiProblem{"Setiap field formulir hanya boleh muncul sekali.", http.StatusBadRequest}
		}
	}
	for key, files := range r.MultipartForm.File {
		if key != "photo" || len(files) != 1 {
			return input, 0, &apiProblem{"Hanya satu file photo yang diizinkan.", http.StatusBadRequest}
		}
	}
	version := 0
	if revision {
		var valid bool
		version, valid = positiveFacilityNumber(values.Get("version"))
		if !valid {
			return input, 0, &apiProblem{"Versi laporan wajib valid.", http.StatusBadRequest}
		}
	}
	input.Category = strings.TrimSpace(values.Get("category"))
	input.Title = strings.TrimSpace(values.Get("title"))
	input.Description = strings.TrimSpace(values.Get("description"))
	input.Address = strings.TrimSpace(values.Get("address"))
	if !models.ValidFacilityCategory(input.Category) {
		return input, 0, &apiProblem{"Kategori fasilitas tidak valid.", http.StatusBadRequest}
	}
	if !facilityTextLength(input.Title, 5, 120) || !facilityTextLength(input.Description, 10, 3000) || !facilityTextLength(input.Address, 5, 300) {
		return input, 0, &apiProblem{"Judul harus 5–120, deskripsi 10–3000, dan alamat 5–300 karakter.", http.StatusBadRequest}
	}
	var valid bool
	input.Latitude, input.Longitude, valid = parseFacilityCoordinates(
		strings.TrimSpace(values.Get("latitude")), strings.TrimSpace(values.Get("longitude")))
	if !valid {
		return input, 0, &apiProblem{"Koordinat harus berupa pasangan latitude dan longitude yang valid.", http.StatusBadRequest}
	}
	photo, _, mediaType, problem := readPickupImage(r, "photo")
	if problem != nil {
		return input, 0, &apiProblem{"Gunakan foto JPEG atau PNG yang valid hingga 5 MiB.", http.StatusBadRequest}
	}
	if len(photo) > 0 {
		if !validFacilityPhoto(photo, mediaType) {
			return input, 0, &apiProblem{"Foto harus berupa JPEG atau PNG yang valid hingga 16 megapiksel.", http.StatusBadRequest}
		}
		input.Photo, input.PhotoType = photo, mediaType
	}
	return input, version, nil
}

func validFacilityPhoto(data []byte, mediaType string) bool {
	if mediaType != "image/jpeg" && mediaType != "image/png" {
		return false
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 || config.Width > facilityImagePixels/config.Height {
		return false
	}
	_, _, err = image.Decode(bytes.NewReader(data))
	return err == nil
}

type facilityVerification struct {
	Status  string  `json:"status"`
	Version int     `json:"version"`
	Note    *string `json:"note"`
}

func readFacilityVerification(w http.ResponseWriter, r *http.Request) (facilityVerification, *apiProblem) {
	var input facilityVerification
	if problem := facilityBody(r, "application/json"); problem != nil {
		return input, problem
	}
	r.Body = http.MaxBytesReader(w, r.Body, facilityVerificationLimit)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		return input, facilityBodyError(err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if !utf8.Valid(data) || decoder.Decode(&input) != nil || decoder.Decode(new(json.RawMessage)) != io.EOF {
		return input, facilityBodyError(nil)
	}
	switch input.Status {
	case models.FacilityApproved, models.FacilityRejected, models.FacilityRevisionRequired:
	default:
		return input, &apiProblem{"Status verifikasi tidak valid.", http.StatusBadRequest}
	}
	if input.Version <= 0 || input.Version > 2147483647 {
		return input, &apiProblem{"Versi laporan wajib valid.", http.StatusBadRequest}
	}
	note := strings.TrimSpace(optionalString(input.Note))
	if !facilityTextLength(note, 0, 1000) || (input.Status != models.FacilityApproved && note == "") {
		return input, &apiProblem{"Alasan revisi atau penolakan wajib diisi. Catatan maksimal 1000 karakter.", http.StatusBadRequest}
	}
	input.Note = nil
	if note != "" {
		input.Note = &note
	}
	return input, nil
}
