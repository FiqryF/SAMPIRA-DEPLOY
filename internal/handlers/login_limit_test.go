package handlers

import (
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestLoginLimitExpiryAndSuccessfulRelease(t *testing.T) {
	l := newLoginLimiter()
	now := time.Unix(1000, 0)
	l.now = func() time.Time { return now }
	for i := 0; i < loginFailureBudget; i++ {
		if release, retry := l.take(fmt.Sprintf("127.0.0.1:%d", 1000+i)); release == nil || retry != 0 {
			t.Fatal("Client port changes must retain the peer budget")
		}
	}
	if release, retry := l.take("127.0.0.1:9999"); release != nil || retry != 60 {
		t.Fatal("Exhausted failure budget must be blocked")
	}
	now = now.Add(time.Minute)
	release, retry := l.take("127.0.0.1:1234")
	if release == nil || retry != 0 {
		t.Fatal("Budget must recover at expiry")
	}
	release()
	release()
	if len(l.windows) != 0 {
		t.Fatal("Successful login must release exactly one slot")
	}
}

func TestLoginLimitConcurrentReservations(t *testing.T) {
	l := newLoginLimiter()
	var accepted atomic.Int32
	var work sync.WaitGroup
	for i := 0; i < 100; i++ {
		work.Add(1)
		go func() {
			defer work.Done()
			if release, _ := l.take("127.0.0.1:5000"); release != nil {
				accepted.Add(1)
			}
		}()
	}
	work.Wait()
	if accepted.Load() != loginFailureBudget {
		t.Fatalf("Concurrent attempts admitted %d", accepted.Load())
	}
}

func TestLoginLimitBoundedMemoryAndOldRelease(t *testing.T) {
	l := newLoginLimiter()
	now := time.Unix(1000, 0)
	l.now = func() time.Time { return now }
	old, _ := l.take("peer:1")
	now = now.Add(time.Minute)
	current, _ := l.take("peer:2")
	old()
	if l.windows["peer"].used != 1 {
		t.Fatal("Old request must not release a newer window")
	}
	current()
	for i := 0; i < loginLimitEntries; i++ {
		l.take(fmt.Sprintf("peer-%d:1", i))
	}
	if release, _ := l.take("extra:1"); release != nil || len(l.windows) != loginLimitEntries {
		t.Fatal("Peer table must be bounded")
	}
	now = now.Add(time.Minute)
	if release, _ := l.take("extra:1"); release == nil {
		t.Fatal("Expired peers must be reclaimed")
	}
}
