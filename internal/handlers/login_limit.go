package handlers

import (
	"net"
	"sync"
	"time"
)

const loginFailureBudget = 30
const loginLimitEntries = 1024

type loginWindow struct {
	until time.Time
	used  int
}

// In-flight attempts reserve a slot; successful authentication releases it.
// Use the socket peer, never an untrusted forwarded header. Limit is per process.
type loginLimiter struct {
	mu      sync.Mutex
	windows map[string]*loginWindow
	now     func() time.Time
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{windows: make(map[string]*loginWindow), now: time.Now}
}

func (l *loginLimiter) take(remote string) (func(), int) {
	ip, _, err := net.SplitHostPort(remote)
	if err != nil {
		ip = remote
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	window := l.windows[ip]
	if window == nil || !now.Before(window.until) {
		delete(l.windows, ip)
		if len(l.windows) >= loginLimitEntries {
			l.pruneExpired(now)
			if len(l.windows) >= loginLimitEntries {
				return nil, 60
			}
		}
		window = &loginWindow{until: now.Add(time.Minute)}
		l.windows[ip] = window
	}
	if window.used >= loginFailureBudget {
		return nil, int((window.until.Sub(now) + time.Second - 1) / time.Second)
	}
	window.used++
	return l.releaseAttempt(ip, window), 0
}

// Caller holds l.mu.
func (l *loginLimiter) pruneExpired(now time.Time) {
	for key, entry := range l.windows {
		if !now.Before(entry.until) {
			delete(l.windows, key)
		}
	}
}

func (l *loginLimiter) releaseAttempt(ip string, window *loginWindow) func() {
	var once sync.Once
	return func() {
		once.Do(func() {
			l.mu.Lock()
			defer l.mu.Unlock()
			if l.windows[ip] == window {
				window.used--
				if window.used == 0 {
					delete(l.windows, ip)
				}
			}
		})
	}
}
