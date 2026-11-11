package handlers

import (
	"bytes"
	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
	"ecorecycle/internal/repositories"
	"errors"
	"image"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

const educationPhotoMax = 750 << 10

func validEducationPhotoURL(raw string) bool {
	parsed, err := url.Parse(raw)
	return err == nil && educationText(raw, 1, 2048, false) && !strings.ContainsAny(raw, " \\") && parsed.Scheme == "https" && parsed.Hostname() != "" && parsed.User == nil
}

func (a *App) educationPhotoConfig(w http.ResponseWriter, r *http.Request) {
	if a.educationAdmin(w, r) == nil {
		return
	}
	httpx.SendResponse(w, "success", "Konfigurasi foto artikel.", map[string]any{"max_photos": 2, "max_upload_bytes": educationPhotoMax}, http.StatusOK)
}

func readEducationUpload(r *http.Request, i int) (repositories.EducationPhotoUpload, *apiProblem) {
	key := "photo_" + strconv.Itoa(i) + "_"
	upload := &repositories.EducationPhotoUpload{}
	upload.URL = strings.TrimSpace(r.FormValue(key + "url"))
	upload.Alt = strings.TrimSpace(r.FormValue(key + "alt"))
	upload.Credit = strings.TrimSpace(r.FormValue(key + "credit"))
	upload.Keep = r.FormValue(key+"keep") == "true"
	if value := r.FormValue(key + "keep"); value != "" && value != "true" && value != "false" {
		return repositories.EducationPhotoUpload{}, &apiProblem{"Penanda foto tersimpan tidak valid.", 400}
	}
	data, _, mime, problem := readPickupImage(r, key+"file")
	if problem != nil {
		return repositories.EducationPhotoUpload{}, problem
	}
	upload.Data = data
	upload.MIME = mime
	if len(r.MultipartForm.File[key+"file"]) > 1 {
		return repositories.EducationPhotoUpload{}, &apiProblem{"Pilih satu file per foto.", 400}
	}
	if problem := validateEducationUpload(upload); problem != nil {
		return repositories.EducationPhotoUpload{}, problem
	}
	return *upload, nil
}

func validateEducationUpload(upload *repositories.EducationPhotoUpload) *apiProblem {
	modes := 0
	for _, active := range []bool{upload.URL != "", len(upload.Data) > 0, upload.Keep} {
		if active {
			modes++
		}
	}
	if modes > 1 {
		return &apiProblem{"Pilih tautan atau upload, bukan keduanya untuk foto yang sama.", 400}
	}
	if modes == 0 {
		return nil
	}
	if !educationText(upload.Alt, 3, 240, false) || !educationText(upload.Credit, 0, 160, false) {
		return &apiProblem{"Deskripsi foto wajib 3–240 karakter, kredit maksimal 160 karakter tanpa markup.", 400}
	}
	if upload.URL != "" && !validEducationPhotoURL(upload.URL) {
		return &apiProblem{"Tautan foto harus HTTPS yang valid tanpa kredensial.", 400}
	}
	if len(upload.Data) > educationPhotoMax {
		return &apiProblem{"Foto tersimpan maksimal 750 KiB. Optimalkan gambar sebelum mengirim.", 413}
	}
	if len(upload.Data) > 0 && !validEducationImage(upload.Data) {
		return &apiProblem{"File gambar tidak valid atau resolusinya terlalu besar.", 400}
	}
	return nil
}

func (a *App) educationSavePhotos(w http.ResponseWriter, r *http.Request) {
	actor := a.educationAdmin(w, r)
	if actor == nil {
		return
	}
	id := educationID(w, r)
	if id == 0 {
		return
	}
	version, problem := educationPhotoForm(w, r)
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	if problem != nil {
		problem.write(w)
		return
	}
	uploads := make([]repositories.EducationPhotoUpload, 2)
	for i := range uploads {
		upload, problem := readEducationUpload(r, i)
		if problem != nil {
			problem.write(w)
			return
		}
		uploads[i] = upload
	}
	if uploads[0].URL == "" && len(uploads[0].Data) == 0 && !uploads[0].Keep && (uploads[1].URL != "" || len(uploads[1].Data) > 0 || uploads[1].Keep) {
		(&apiProblem{"Isi foto utama sebelum foto pendamping.", 400}).write(w)
		return
	}
	item, err := a.Education.SavePhotos(r.Context(), id, version, actor.ID, uploads)
	if errors.Is(err, repositories.ErrEducationPhotoCapacity) {
		(&apiProblem{"Foto melebihi kapasitas unggahan database. Gunakan gambar lebih kecil.", 413}).write(w)
		return
	}
	if err != nil {
		educationFailure(w, err)
		return
	}
	httpx.SendResponse(w, "success", "Foto artikel tersimpan.", item, 200)
}

func (a *App) educationPhoto(w http.ResponseWriter, r *http.Request) {
	id := educationID(w, r)
	if id == 0 {
		return
	}
	slot, err := strconv.Atoi(r.PathValue("slot"))
	if err != nil || slot < 0 || slot > 1 {
		http.NotFound(w, r)
		return
	}
	actor, authErr := a.apiSession(r)
	admin := authErr == nil && actor.Role == models.RoleAdmin
	data, mime, err := a.Education.Photo(r.Context(), id, slot, admin)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Write(data)
}

func validEducationImage(data []byte) bool {
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	return err == nil && config.Width > 0 && config.Height > 0 && int64(config.Width)*int64(config.Height) <= 24_000_000
}

func educationPhotoForm(w http.ResponseWriter, r *http.Request) (int, *apiProblem) {
	if r.URL.RawQuery != "" {
		return 0, &apiProblem{"Kirim field foto melalui body.", 400}
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	if err := r.ParseMultipartForm(2 << 20); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			return 0, &apiProblem{"Ukuran kiriman foto melebihi batas 2 MB.", http.StatusRequestEntityTooLarge}
		} else {
			return 0, &apiProblem{"Kirim foto melalui multipart/form-data.", http.StatusBadRequest}
		}
	}
	for name := range r.MultipartForm.File {
		if name != "photo_0_file" && name != "photo_1_file" {
			return 0, &apiProblem{"Maksimal dua foto artikel.", 400}
		}
	}
	version, err := strconv.Atoi(r.FormValue("version"))
	if err != nil || version < 1 || version >= educationMaxVersion {
		return 0, &apiProblem{"Versi artikel tidak valid.", 400}
	}

	return version, nil
}
