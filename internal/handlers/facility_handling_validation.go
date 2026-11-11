package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"ecorecycle/internal/models"
)

func handlingBadRequest(message string) *apiProblem {
	return &apiProblem{message, http.StatusBadRequest}
}

func decodeHandlingJSON(w http.ResponseWriter, r *http.Request, dst any) *apiProblem {
	if problem := facilityBody(r, "application/json"); problem != nil {
		return problem
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, facilityVerificationLimit))
	if err != nil {
		return facilityBodyError(err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if !utf8.Valid(data) || decoder.Decode(dst) != nil || decoder.Decode(new(json.RawMessage)) != io.EOF {
		return facilityBodyError(nil)
	}
	return nil
}

func handlingVersion(value *int) bool {
	return value != nil && *value >= 0 && int64(*value) <= 2147483647
}

func handlingText(value string, maxLength int, required bool) (*string, bool) {
	text := strings.TrimSpace(value)
	if text == "" {
		return nil, !required
	}
	return &text, facilityTextLength(text, 1, maxLength)
}

func readHandlingAssignment(w http.ResponseWriter, r *http.Request) (models.HandlingCommand, *apiProblem) {
	var input struct {
		Version      *int   `json:"version"`
		PetugasID    int    `json:"petugas_id"`
		InternalNote string `json:"internal_note"`
	}
	if problem := decodeHandlingJSON(w, r, &input); problem != nil {
		return models.HandlingCommand{}, problem
	}
	note, valid := handlingText(input.InternalNote, 1000, false)
	if !handlingVersion(input.Version) || input.PetugasID <= 0 || int64(input.PetugasID) > 2147483647 || !valid {
		return models.HandlingCommand{}, handlingBadRequest("Versi, ID Petugas, atau catatan tidak valid.")
	}
	return models.HandlingCommand{Action: models.HandlingAssign, Version: *input.Version, PetugasID: input.PetugasID,
		FacilityHandlingEvent: models.FacilityHandlingEvent{InternalNote: note}}, nil
}

func readHandlingReview(w http.ResponseWriter, r *http.Request) (models.HandlingCommand, *apiProblem) {
	var input struct {
		Version               *int                  `json:"version"`
		Decision              models.HandlingAction `json:"decision"`
		InternalNote          string                `json:"internal_note"`
		PublicNote            string                `json:"public_note"`
		PublicEvidenceVersion *int                  `json:"public_evidence_version"`
	}
	if problem := decodeHandlingJSON(w, r, &input); problem != nil {
		return models.HandlingCommand{}, problem
	}
	if !handlingVersion(input.Version) || (input.Decision != models.HandlingComplete && input.Decision != models.HandlingRequestRevision) ||
		(input.PublicEvidenceVersion != nil && (input.Decision != models.HandlingComplete ||
			*input.PublicEvidenceVersion <= 0 || int64(*input.PublicEvidenceVersion) > 2147483647)) {
		return models.HandlingCommand{}, handlingBadRequest("Versi, keputusan, atau versi bukti tidak valid.")
	}
	internal, validInternal := handlingText(input.InternalNote, 1000, input.Decision == models.HandlingRequestRevision)
	public, validPublic := handlingText(input.PublicNote, 1000, input.Decision == models.HandlingComplete)
	if !validInternal || !validPublic {
		return models.HandlingCommand{}, handlingBadRequest("Isi alasan internal untuk revisi atau ringkasan publik untuk penyelesaian. Maksimal 1000 karakter.")
	}
	return models.HandlingCommand{Action: input.Decision, Version: *input.Version, PublicEvidenceVersion: input.PublicEvidenceVersion,
		FacilityHandlingEvent: models.FacilityHandlingEvent{InternalNote: internal, PublicNote: public}}, nil
}

func handlingMultipart(w http.ResponseWriter, r *http.Request) (url.Values, *apiProblem) {
	if problem := facilityBody(r, "multipart/form-data"); problem != nil {
		return nil, problem
	}
	r.Body = http.MaxBytesReader(w, r.Body, facilityFormLimit)
	if err := r.ParseMultipartForm(facilityFormLimit); err != nil {
		return nil, facilityBodyError(err)
	}
	return url.Values(r.MultipartForm.Value), nil
}

func handlingFormCommand(r *http.Request, values url.Values, photoAllowed bool, allowed ...string) (models.HandlingCommand, *apiProblem) {
	fields := map[string]bool{"version": true}
	for _, name := range allowed {
		fields[name] = true
	}
	for key, entries := range values {
		if !fields[key] || len(entries) != 1 {
			return models.HandlingCommand{}, handlingBadRequest("Field formulir tambahan atau ganda tidak diizinkan.")
		}
	}
	version, err := strconv.ParseInt(values.Get("version"), 10, 32)
	if err != nil || version < 0 {
		return models.HandlingCommand{}, handlingBadRequest("Versi penanganan tidak valid.")
	}
	cmd := models.HandlingCommand{Version: int(version)}
	for key, files := range r.MultipartForm.File {
		if key != "photo" || len(files) != 1 || !photoAllowed {
			return cmd, handlingBadRequest("Unggahan untuk aksi ini tidak valid. Maksimal satu foto.")
		}
	}
	photo, _, mediaType, problem := readPickupImage(r, "photo")
	if problem != nil || (len(photo) > 0 && !validFacilityPhoto(photo, mediaType)) {
		return cmd, handlingBadRequest("Gunakan foto JPEG atau PNG yang valid hingga 5 MiB dan 16 megapiksel.")
	}
	cmd.Photo, cmd.PhotoType = photo, mediaType
	return cmd, nil
}

func readHandlingActivity(w http.ResponseWriter, r *http.Request) (models.HandlingCommand, *apiProblem) {
	values, problem := handlingMultipart(w, r)
	if problem != nil {
		return models.HandlingCommand{}, problem
	}
	defer r.MultipartForm.RemoveAll()
	action := models.HandlingAction(values.Get("action"))
	fields := []string{"action", "internal_note", "public_note"}
	switch action {
	case models.HandlingStartAssessment:
	case models.HandlingRecordAssessment:
		fields = append(fields, "condition", "assessment")
	case models.HandlingRecordProgress:
		fields = append(fields, "action_taken")
	case models.HandlingSubmitResolution:
		fields = append(fields, "result")
	default:
		return models.HandlingCommand{}, handlingBadRequest("Aksi lapangan tidak valid.")
	}
	cmd, problem := handlingFormCommand(r, values, action != models.HandlingStartAssessment, fields...)
	if problem != nil {
		return cmd, problem
	}
	cmd.Action = action
	for _, field := range []struct {
		name     string
		dst      **string
		required bool
	}{
		{"internal_note", &cmd.InternalNote, false}, {"public_note", &cmd.PublicNote, false},
		{"condition", &cmd.Condition, action == models.HandlingRecordAssessment}, {"assessment", &cmd.Assessment, action == models.HandlingRecordAssessment},
		{"action_taken", &cmd.ActionTaken, action == models.HandlingRecordProgress}, {"result", &cmd.Result, action == models.HandlingSubmitResolution},
	} {
		value, valid := handlingText(values.Get(field.name), 1000, field.required)
		if !valid {
			return cmd, handlingBadRequest("Isi field " + field.name + " yang valid hingga 1000 karakter.")
		}
		*field.dst = value
	}
	return cmd, nil
}

func readHandlingCoordination(w http.ResponseWriter, r *http.Request) (models.HandlingCommand, *apiProblem) {
	values, problem := handlingMultipart(w, r)
	if problem != nil {
		return models.HandlingCommand{}, problem
	}
	defer r.MultipartForm.RemoveAll()
	status := values.Get("status")
	fields := []string{"status", "reference", "internal_note"}
	switch status {
	case models.CoordinationForwarded:
		fields = append(fields, "agency", "channel", "forwarded_at")
	case models.CoordinationReceipt, models.CoordinationFollowUp, models.CoordinationVerified:
	default:
		return models.HandlingCommand{}, handlingBadRequest("Status koordinasi tidak valid.")
	}
	cmd, problem := handlingFormCommand(r, values, true, fields...)
	if problem != nil {
		return cmd, problem
	}
	cmd.Action, cmd.CoordinationStatus = models.HandlingCoordinate, &status
	var valid bool
	cmd.InternalNote, valid = handlingText(values.Get("internal_note"), 1000, true)
	if !valid {
		return cmd, handlingBadRequest("Catatan koordinasi wajib diisi hingga 1000 karakter.")
	}
	cmd.Reference, valid = handlingText(values.Get("reference"), 120, false)
	if !valid || ((status == models.CoordinationReceipt || status == models.CoordinationVerified) && cmd.Reference == nil && len(cmd.Photo) == 0) {
		return cmd, handlingBadRequest("Sertakan referensi valid atau foto bukti untuk konfirmasi atau verifikasi eksternal.")
	}
	if status == models.CoordinationForwarded {
		agency, validAgency := handlingText(values.Get("agency"), 160, true)
		channel, validChannel := handlingText(values.Get("channel"), 80, true)
		sentAt, err := time.Parse(time.RFC3339, values.Get("forwarded_at"))
		if !validAgency || !validChannel || err != nil || sentAt.UTC().Year() < 1000 || sentAt.After(time.Now()) {
			return cmd, handlingBadRequest("Instansi, saluran, dan waktu penerusan RFC 3339 yang valid wajib diisi.")
		}
		utc := sentAt.UTC()
		cmd.Agency, cmd.Channel, cmd.ForwardedAt = agency, channel, &utc
	}
	return cmd, nil
}
