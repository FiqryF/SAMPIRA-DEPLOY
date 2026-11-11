package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPortalCookieAndOrigin(t *testing.T) {
	for _, test := range []struct {
		name           string
		requestURL     string
		configuredTLS  bool
		expectedSecure bool
		origin         string
	}{
		{"local HTTP", "http://sampira.test/logout", false, false, "http://sampira.test"},
		{"direct HTTPS", "https://sampira.test/logout", false, true, "https://sampira.test"},
		{"HTTPS behind configured proxy", "http://sampira.test/logout", true, true, "https://sampira.test"},
	} {
		t.Run(test.name, func(t *testing.T) {
			app := &App{SecureCookies: test.configuredTLS}
			req := httptest.NewRequest(http.MethodPost, test.requestURL, nil)
			req.Header.Set("X-Forwarded-Proto", "https")
			req.Header.Set("Origin", test.origin)
			w := httptest.NewRecorder()
			app.setPortalCookie(w, req, "fixture", 60)
			cookie := w.Result().Cookies()[0]
			if !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Secure != test.expectedSecure || cookie.Path != "/" {
				t.Fatalf("unexpected cookie flags: %+v", cookie)
			}
			if !app.AllowBrowserWrite(httptest.NewRecorder(), req) {
				t.Fatal("same-origin request rejected")
			}
			req.Header.Set("Origin", "https://sampira.test.attacker.invalid")
			if app.AllowBrowserWrite(httptest.NewRecorder(), req) {
				t.Fatal("cross-origin write accepted")
			}
		})
	}
}
