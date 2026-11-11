package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const maxPickupImage = 5 << 20

var photoTypes = map[string]string{
	".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
}

func readPickupImage(r *http.Request, field string) ([]byte, string, string, *apiProblem) {
	file, header, err := r.FormFile(field)
	if errors.Is(err, http.ErrMissingFile) || errors.Is(err, http.ErrNotMultipart) {
		return nil, "", "", nil
	}
	if err != nil {
		return nil, "", "", &apiProblem{"Unggahan tidak dapat dibaca.", http.StatusBadRequest}
	}
	defer file.Close()
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !validPhotoExtension(ext) || header.Size > maxPickupImage {
		return nil, "", "", &apiProblem{"Gunakan gambar JPG, PNG, atau WEBP hingga 5 MB.", http.StatusBadRequest}
	}
	data, err := io.ReadAll(io.LimitReader(file, maxPickupImage+1))
	if err != nil || len(data) == 0 || len(data) > maxPickupImage || http.DetectContentType(data) != photoTypes[ext] {
		return nil, "", "", &apiProblem{"Isi atau ukuran gambar tidak valid.", http.StatusBadRequest}
	}
	return data, ext, photoTypes[ext], nil
}

func savePickupPhoto(data []byte, ext string) (*string, *apiProblem) {
	if data == nil {
		return nil, nil
	}
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return nil, &apiProblem{"Gagal membuat nama foto.", http.StatusInternalServerError}
	}
	if err := os.MkdirAll("uploads", 0700); err != nil {
		return nil, &apiProblem{"Gagal menyimpan foto.", http.StatusInternalServerError}
	}
	name := hex.EncodeToString(nonce) + ext
	if err := os.WriteFile(filepath.Join("uploads", name), data, 0600); err != nil {
		return nil, &apiProblem{"Gagal menyimpan foto.", http.StatusInternalServerError}
	}
	url := "uploads/" + name
	return &url, nil
}

func validPhotoExtension(ext string) bool {
	_, ok := photoTypes[ext]
	return ok
}
