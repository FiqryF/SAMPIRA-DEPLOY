package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
)

const portalCookie = "sampira_session"
const accessCacheHeader = "Cache-Control"
const accessCacheNoStore = "no-store"

var invalidSession = errors.New("Sesi tidak valid atau kedaluwarsa. Silakan login kembali.")

func (a *App) setPortalCookie(w http.ResponseWriter, r *http.Request, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: portalCookie, Value: token, Path: "/", HttpOnly: true,
		Secure:   r.TLS != nil || a.SecureCookies,
		SameSite: http.SameSiteLaxMode, MaxAge: maxAge,
	})
}

func (a *App) currentSession(token string) (*models.TokenPayload, error) {
	if token == "" {
		return nil, invalidSession
	}
	session, err := a.Auth.ValidateToken(token)
	if err != nil {
		return nil, invalidSession
	}
	session.Role, session.Name, err = a.Users.ActiveSession(session.ID, token)
	if err != nil || !models.ValidRole(session.Role) {
		return nil, invalidSession
	}
	return session, nil
}

func (a *App) apiSession(r *http.Request) (*models.TokenPayload, error) {
	header := r.Header.Get("Authorization")
	if header == "" {
		return a.browserSession(r)
	}
	scheme, token, ok := strings.Cut(header, " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return nil, invalidSession
	}
	return a.currentSession(token)
}

func (a *App) browserSession(r *http.Request) (*models.TokenPayload, error) {
	cookie, err := r.Cookie(portalCookie)
	if err != nil {
		return nil, invalidSession
	}
	return a.currentSession(cookie.Value)
}

func (a *App) Portal(role, file string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set(accessCacheHeader, accessCacheNoStore)
		session, err := a.browserSession(r)
		if err != nil {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}
		if session.Role != role {
			http.Error(w, "Akses portal ditolak.", http.StatusForbidden)
			return
		}
		http.ServeFile(w, r, file)
	}
}

func (a *App) LogoutHandler(w http.ResponseWriter, r *http.Request) {
	token := ""
	if cookie, err := r.Cookie(portalCookie); err == nil {
		token = cookie.Value
	} else if header := r.Header.Get("Authorization"); header != "" {
		scheme, value, ok := strings.Cut(header, " ")
		if !ok || !strings.EqualFold(scheme, "Bearer") {
			http.Error(w, invalidSession.Error(), http.StatusUnauthorized)
			return
		}
		token = value
	}
	if token != "" {
		if err := a.Users.RevokeSession(token); err != nil {
			http.Error(w, "Sesi gagal dicabut. Coba lagi.", http.StatusServiceUnavailable)
			return
		}
	}
	a.setPortalCookie(w, r, "", -1)
	w.Header().Set(accessCacheHeader, accessCacheNoStore)
	http.Redirect(w, r, "/login", http.StatusSeeOther)
}

func (a *App) AdministratorSessionHandler(w http.ResponseWriter, r *http.Request) {
	session, err := a.apiSession(r)
	if err != nil {
		httpx.SendResponse(w, "error", err.Error(), nil, http.StatusUnauthorized)
		return
	}
	if session.Role != models.RoleAdministrator {
		httpx.SendResponse(w, "error", "Akses Administrator diperlukan.", nil, http.StatusForbidden)
		return
	}
	httpx.SendResponse(w, "success", "Sesi Administrator aktif.", map[string]string{"role": session.Role}, http.StatusOK)
}

func canReadPickup(session *models.TokenPayload, owner int, assignee *int) bool {
	switch session.Role {
	case models.RoleUser:
		return owner == session.ID
	case models.RolePetugas:
		return assignee != nil && *assignee == session.ID
	default:
		return false
	}
}

func (a *App) PickupPhotoHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set(accessCacheHeader, accessCacheNoStore)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	var session *models.TokenPayload
	var err error
	if r.Header.Get("Authorization") != "" {
		session, err = a.apiSession(r)
	} else {
		session, err = a.browserSession(r)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}
	if session.Role != models.RoleUser && session.Role != models.RolePetugas {
		http.Error(w, "Akses foto ditolak.", http.StatusForbidden)
		return
	}
	name := r.PathValue("name")
	if name != filepath.Base(name) || strings.ContainsAny(name, "/\\:") || !validPhotoExtension(strings.ToLower(filepath.Ext(name))) {
		http.NotFound(w, r)
		return
	}

	var owner int
	var assignee *int
	err = a.DB.QueryRow("SELECT user_id, collector_id FROM pickups WHERE photo_url IN (?, ?)", "uploads/"+name, "/uploads/"+name).Scan(&owner, &assignee)
	if err == sql.ErrNoRows {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, "Kesalahan database.", http.StatusInternalServerError)
		return
	}
	if !canReadPickup(session, owner, assignee) {
		http.Error(w, "Akses foto ditolak.", http.StatusForbidden)
		return
	}
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	http.ServeFile(w, r, filepath.Join("uploads", name))
}

// Reject writes from other origins, including sibling origins that receive SameSite cookies.
func (a *App) AllowBrowserWrite(w http.ResponseWriter, r *http.Request) bool {
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	}
	site := r.Header.Get("Sec-Fetch-Site")
	origin := r.Header.Get("Origin")
	if site == "cross-site" || site == "same-site" || (origin != "" && !a.sameOrigin(r, origin)) {
		httpx.SendResponse(w, "error", "Permintaan lintas situs ditolak.", nil, http.StatusForbidden)
		return false
	}
	if _, err := r.Cookie(portalCookie); err == nil && origin == "" && site != "same-origin" && r.Header.Get("Authorization") == "" {
		httpx.SendResponse(w, "error", "Asal permintaan sesi browser diperlukan.", nil, http.StatusForbidden)
		return false
	}
	return true
}

func (a *App) sameOrigin(r *http.Request, origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	scheme := "http"
	if r.TLS != nil || a.SecureCookies {
		scheme = "https"
	}
	return parsed.Scheme == scheme && strings.EqualFold(parsed.Host, r.Host)
}
