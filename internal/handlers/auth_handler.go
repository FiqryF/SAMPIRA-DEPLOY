package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
	"ecorecycle/internal/repositories"
	"ecorecycle/internal/services"

	"github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"
)

type App struct {
	DB               *sql.DB
	Auth             *services.AuthService
	SecureCookies    bool
	Users            *repositories.UserRepository
	Pickups          *repositories.PickupRepository
	Announcements    *repositories.AnnouncementRepository
	FacilityReports  repositories.FacilityReports
	FacilityHandling repositories.FacilityHandling
	Education        repositories.Education
	loginAttempts    *loginLimiter
}

func NewApp(db *sql.DB, auth *services.AuthService) *App {
	return &App{
		DB:               db,
		Auth:             auth,
		Users:            repositories.NewUserRepository(db),
		Pickups:          repositories.NewPickupRepository(db),
		Announcements:    repositories.NewAnnouncementRepository(db),
		FacilityReports:  repositories.FacilityReports{DB: db},
		FacilityHandling: repositories.FacilityHandling{DB: db},
		Education:        repositories.Education{DB: db},
		loginAttempts:    newLoginLimiter(),
	}
}

func (a *App) LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	var releaseAttempt func()
	if a.loginAttempts != nil {
		var retry int
		releaseAttempt, retry = a.loginAttempts.take(r.RemoteAddr)
		if releaseAttempt == nil {
			w.Header().Set("Retry-After", strconv.Itoa(retry))
			httpx.SendResponse(w, "error", "Percobaan login terlalu banyak. Tunggu satu menit sebelum mencoba lagi.", nil, http.StatusTooManyRequests)
			return
		}
	}
	data := httpx.RequestData(r)
	email := strings.ToLower(strings.TrimSpace(data["email"]))
	password := data["password"]

	if email == "" || password == "" {
		httpx.SendResponse(w, "error", "Email dan password wajib diisi.", nil, http.StatusBadRequest)
		return
	}

	user, err := a.Users.FindByEmail(email)
	if err == sql.ErrNoRows {
		httpx.SendResponse(w, "error", "Email atau password salah.", nil, http.StatusUnauthorized)
		return
	} else if err != nil {
		httpx.SendResponse(w, "error", "Kesalahan server internal.", nil, http.StatusInternalServerError)
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password))
	if err != nil || !models.ValidRole(user.Role) {
		httpx.SendResponse(w, "error", "Email atau password salah.", nil, http.StatusUnauthorized)
		return
	}

	token, err := a.Auth.GenerateToken(user.ID, user.Role, user.Name)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal menghasilkan token.", nil, http.StatusInternalServerError)
		return
	}

	if err := a.Users.CreateSession(user.ID, user.Password, token, time.Now().Add(services.SessionTTL)); err != nil {
		httpx.SendResponse(w, "error", "Gagal membuat sesi aktif.", nil, http.StatusUnauthorized)
		return
	}
	if releaseAttempt != nil {
		releaseAttempt()
	}
	a.setPortalCookie(w, r, token, int(services.SessionTTL.Seconds()))
	if r.Header.Get("X-SAMPIRA-Portal") == "1" {
		httpx.SendResponse(w, "success", "Login berhasil.", map[string]interface{}{"id": user.ID, "name": user.Name, "role": user.Role}, http.StatusOK)
		return
	}
	respData := map[string]interface{}{
		"id":                    user.ID,
		"name":                  user.Name,
		"email":                 user.Email,
		"role":                  user.Role,
		"phone":                 user.Phone,
		"address":               user.Address,
		"payout_method":         user.PayoutMethod,
		"payout_account_name":   user.PayoutAccountName,
		"payout_account_number": user.PayoutAccountNumber,
		"token":                 token,
	}

	httpx.SendResponse(w, "success", "Login berhasil.", respData, http.StatusOK)
}

func (a *App) RegisterHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	data := httpx.RequestData(r)
	name := strings.TrimSpace(data["name"])
	email := strings.ToLower(strings.TrimSpace(data["email"]))
	password := data["password"]

	if name == "" || email == "" || password == "" {
		httpx.SendResponse(w, "error", "Nama, email, dan password wajib diisi.", nil, http.StatusBadRequest)
		return
	}
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) > 100 || strings.ContainsRune(name, 0) {
		httpx.SendResponse(w, "error", "Nama lengkap maksimal 100 karakter.", nil, http.StatusBadRequest)
		return
	}
	parsed, emailErr := mail.ParseAddress(email)
	domainStart := strings.LastIndex(email, "@")
	if emailErr != nil || parsed.Address != email || utf8.RuneCountInString(email) > 100 ||
		domainStart < 0 || !strings.Contains(email[domainStart+1:], ".") {
		httpx.SendResponse(w, "error", "Format email tidak valid.", nil, http.StatusBadRequest)
		return
	}
	if len(password) < 6 || len(password) > 72 {
		httpx.SendResponse(w, "error", "Password harus terdiri dari 6 hingga 72 byte.", nil, http.StatusBadRequest)
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal melakukan hash password.", nil, http.StatusInternalServerError)
		return
	}

	if err := a.Users.Create(name, email, string(hashedPassword), models.RoleUser); err != nil {
		var databaseError *mysql.MySQLError
		if errors.As(err, &databaseError) && databaseError.Number == 1062 {
			httpx.SendResponse(w, "error", "Email sudah digunakan.", nil, http.StatusConflict)
			return
		}
		httpx.SendResponse(w, "error", "Gagal menyimpan data pengguna.", nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Pendaftaran akun berhasil. Silakan login.", nil, http.StatusCreated)
}

func (a *App) ProfileGetHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	sessionUser, err := a.apiSession(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}

	user, err := a.Users.FindByID(sessionUser.ID)
	if err == sql.ErrNoRows {
		httpx.SendResponse(w, "error", "Pengguna tidak ditemukan.", nil, http.StatusNotFound)
		return
	} else if err != nil {
		httpx.SendResponse(w, "error", "Kesalahan server internal.", nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Profil berhasil diambil.", user, http.StatusOK)
}

func (a *App) ProfileUpdateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	sessionUser, err := a.apiSession(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}

	data := httpx.RequestData(r)
	name := strings.TrimSpace(data["name"])
	phone := strings.TrimSpace(data["phone"])
	address := strings.TrimSpace(data["address"])
	payoutMethod := strings.TrimSpace(data["payout_method"])
	payoutAccountName := strings.TrimSpace(data["payout_account_name"])
	payoutAccountNumber := strings.TrimSpace(data["payout_account_number"])

	if name == "" {
		httpx.SendResponse(w, "error", "Nama lengkap wajib diisi.", nil, http.StatusBadRequest)
		return
	}
	if payoutMethod != "" && payoutMethod != "bank" && payoutMethod != "ewallet" && payoutMethod != "cash" {
		httpx.SendResponse(w, "error", "Metode payout tidak valid.", nil, http.StatusBadRequest)
		return
	}
	if payoutMethod != "" && payoutMethod != "cash" && (payoutAccountName == "" || payoutAccountNumber == "") {
		httpx.SendResponse(w, "error", "Nama penerima dan nomor rekening/e-wallet wajib diisi.", nil, http.StatusBadRequest)
		return
	}

	if err := a.Users.UpdateProfile(sessionUser.ID, name, phone, address, payoutMethod, payoutAccountName, payoutAccountNumber); err != nil {
		httpx.SendResponse(w, "error", "Gagal menyimpan profil.", nil, http.StatusInternalServerError)
		return
	}

	user, err := a.Users.FindByID(sessionUser.ID)
	if err != nil {
		httpx.SendResponse(w, "error", "Profil tersimpan, tetapi gagal mengambil data terbaru.", nil, http.StatusInternalServerError)
		return
	}

	httpx.SendResponse(w, "success", "Profil dan data payout berhasil disimpan.", user, http.StatusOK)
}

func (a *App) ListCollectorsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.SendResponse(w, "error", methodNotAllowedMessage, nil, http.StatusMethodNotAllowed)
		return
	}
	sessionUser, err := a.apiSession(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}
	if sessionUser.Role != models.RoleAdministrator {
		httpx.SendResponse(w, "error", "Akses ditolak. Hanya Administrator yang dapat melihat daftar petugas.", nil, http.StatusForbidden)
		return
	}

	collectors, err := a.Users.ListCollectors()
	if err != nil {
		httpx.SendResponse(w, "error", "Gagal mengambil daftar petugas.", nil, http.StatusInternalServerError)
		return
	}
	httpx.SendResponse(w, "success", "Daftar petugas berhasil diambil.", collectors, http.StatusOK)
}
