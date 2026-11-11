package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRequestDataIgnoresQuery(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/login?password=fixture&name=query", strings.NewReader("name=body"))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	data := RequestData(r)
	if data["name"] != "body" || data["password"] != "" {
		t.Fatal("POST parser accepted a query-string value")
	}
}
