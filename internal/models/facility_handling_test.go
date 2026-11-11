package models

import "testing"

func TestFacilityHandlingTransitions(t *testing.T) {
	cases := []struct {
		current string
		action  HandlingAction
		next    string
	}{
		{FacilityPending, HandlingAssign, ""},
		{FacilityRejected, HandlingAssign, ""},
		{FacilityApproved, HandlingAssign, HandlingAssigned},
		{HandlingAssigned, HandlingStartAssessment, HandlingAssessing},
		{HandlingAssigned, HandlingSubmitResolution, ""},
		{HandlingAssessing, HandlingRecordAssessment, HandlingInProgress},
		{HandlingAssessing, HandlingComplete, ""},
		{HandlingInProgress, HandlingRecordProgress, HandlingInProgress},
		{HandlingInProgress, HandlingSubmitResolution, HandlingSubmitted},
		{HandlingSubmitted, HandlingRequestRevision, HandlingRevision},
		{HandlingRevision, HandlingSubmitResolution, ""},
		{HandlingRevision, HandlingRecordProgress, HandlingInProgress},
		{HandlingSubmitted, HandlingComplete, HandlingCompleted},
		{HandlingSubmitted, HandlingReassign, HandlingAssigned},
		{HandlingCompleted, HandlingReassign, ""},
		{HandlingCompleted, HandlingRecordProgress, ""},
		{HandlingInProgress, HandlingCoordinate, HandlingInProgress},
	}
	for _, tc := range cases {
		if next := NextHandlingStatus(tc.current, tc.action); next != tc.next {
			t.Errorf("%s + %s: got %q, want %q", tc.current, tc.action, next, tc.next)
		}
	}
}

func TestFacilityCoordinationOrder(t *testing.T) {
	states := []string{CoordinationNotForwarded, CoordinationForwarded, CoordinationReceipt, CoordinationFollowUp, CoordinationVerified, ""}
	for i := 0; i < len(states)-1; i++ {
		if next := NextHandlingCoordination(states[i]); next != states[i+1] {
			t.Errorf("%s: got %q, want %q", states[i], next, states[i+1])
		}
	}
}
