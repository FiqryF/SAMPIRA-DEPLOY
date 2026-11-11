package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ecorecycle/internal/models"
)

func TestHandlingAssignmentJSON(t *testing.T) {
	for _, test := range []struct {
		body  string
		valid bool
	}{
		{`{"version":0,"petugas_id":102}`, true},
		{`{"petugas_id":102}`, false},
		{`{"version":null,"petugas_id":102}`, false},
		{`{"version":-1,"petugas_id":102}`, false},
		{`{"version":0,"petugas_id":0}`, false},
		{`{"version":0,"petugas_id":102,"actor_id":12}`, false},
		{`{"version":0,"petugas_id":102} {}`, false},
	} {
		request := httptest.NewRequest(http.MethodPost, "/assignment", strings.NewReader(test.body))
		request.Header.Set("Content-Type", "application/json")
		cmd, problem := readHandlingAssignment(httptest.NewRecorder(), request)
		if (problem == nil) != test.valid || (problem == nil && (cmd.Action != models.HandlingAssign || cmd.Version != 0 || cmd.PetugasID != 102)) {
			t.Errorf("%s: got %v and %v", test.body, cmd.Action, problem)
		}
	}
}
