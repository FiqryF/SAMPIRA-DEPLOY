package main

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"ecorecycle/db_init/migrations"
	"ecorecycle/internal/handlers"
	"ecorecycle/internal/models"
	"ecorecycle/internal/repositories"
	"ecorecycle/internal/services"

	_ "github.com/go-sql-driver/mysql"
)

func loadEnv() {
	file, err := os.Open(".env")
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			value = strings.Trim(value, "\"'")
			if os.Getenv(key) == "" {
				os.Setenv(key, value)
			}
		}
	}
}

func initDB() *sql.DB {
	host := os.Getenv("DB_HOST")
	if host == "" {
		host = "localhost"
	}
	user := os.Getenv("DB_USER")
	if user == "" {
		user = "root"
	}
	pass := os.Getenv("DB_PASS")
	dbName := os.Getenv("DB_NAME")
	if dbName == "" {
		dbName = "ecorecycle"
	}
	if !strings.Contains(host, ":") {
		host = host + ":3306"
	}

	var dsn string
	if pass == "" {
		dsn = fmt.Sprintf("%s@tcp(%s)/%s?parseTime=true", user, host, dbName)
	} else {
		dsn = fmt.Sprintf("%s:%s@tcp(%s)/%s?parseTime=true", user, pass, host, dbName)
	}

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Gagal membuka database: %v", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Fatalf("Gagal terhubung ke MySQL database: %v", err)
	}
	log.Println("Berhasil terhubung ke database.")
	return db
}

func prepareApplicationSchemas(app *handlers.App, db *sql.DB) error {
	if err := app.Users.EnsureProfileSchema(); err != nil {
		return fmt.Errorf("Gagal menyiapkan kolom profil payout: %w", err)
	}
	if err := app.Users.EnsureSessionSchema(); err != nil {
		return fmt.Errorf("Gagal menyiapkan sesi: %w", err)
	}
	if err := app.Pickups.EnsureVerificationSchema(); err != nil {
		return fmt.Errorf("Gagal menyiapkan kolom verifikasi penjemputan: %w", err)
	}
	if err := app.Pickups.EnsureWorkflowSchema(); err != nil {
		return fmt.Errorf("Gagal menyiapkan skema pickup Phase 2: %w", err)
	}
	if err := app.Announcements.EnsureSchema(); err != nil {
		return fmt.Errorf("Gagal menyiapkan tabel CMS portal: %w", err)
	}
	if err := migrations.ApplyFacilityReports(context.Background(), db); err != nil {
		return fmt.Errorf("Gagal menyiapkan skema laporan fasilitas: %w", err)
	}
	if err := migrations.ApplyFacilityHandling(context.Background(), db); err != nil {
		return fmt.Errorf("Gagal menyiapkan skema penanganan fasilitas: %w", err)
	}
	if err := migrations.ApplyPreciseLocations(context.Background(), db); err != nil {
		return fmt.Errorf("Gagal menyiapkan skema lokasi penjemputan: %w", err)
	}
	if err := migrations.ApplyEducationContent(context.Background(), db); err != nil {
		return fmt.Errorf("Gagal menyiapkan skema Pusat Edukasi: %w", err)
	}
	if err := migrations.ApplyPickupIdempotency(context.Background(), db); err != nil {
		return fmt.Errorf("Gagal menyiapkan idempotency penjemputan: %w", err)
	}
	if err := migrations.ApplyRegistrationUnicode(context.Background(), db); err != nil {
		return fmt.Errorf("Gagal menyiapkan teks registrasi Unicode: %w", err)
	}

	return nil
}

func main() {
	loadEnv()
	if len(os.Args) > 1 {
		if os.Args[1] != "-bootstrap-administrator" || len(os.Args) != 4 {
			log.Fatal("penggunaan: server [-bootstrap-administrator NAMA EMAIL]")
		}
		db := initDB()
		defer db.Close()
		if err := bootstrapAdministrator(repositories.NewUserRepository(db), os.Args[2:], os.Stdin); err != nil {
			log.Fatal(err)
		}
		log.Println("Akun Administrator dibuat.")
		return
	}
	authService, err := services.NewAuthService(os.Getenv("JWT_SECRET"))
	if err != nil {
		log.Fatal(err)
	}
	db := initDB()
	defer db.Close()

	app := handlers.NewApp(db, authService)
	app.SecureCookies = os.Getenv("SAMPIRA_SECURE_COOKIE") == "true"
	if err := prepareApplicationSchemas(app, db); err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	if err := migrations.ApplyContributions(context.Background(), db); err != nil {
		log.Fatalf("Gagal menyiapkan skema kontribusi Phase 9: %v", err)
	}
	app.RegisterContributions(mux)

	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFile(w, r, "app/Views/index.html")
			return
		}
		http.NotFound(w, r)
	})
	mux.HandleFunc("GET /home", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "app/Views/index.html")
	})
	mux.HandleFunc("GET /favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/assets/img/waste-organic.svg", http.StatusTemporaryRedirect)
	})
	mux.HandleFunc("GET /login", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "app/Views/login.html")
	})
	mux.HandleFunc("GET /register", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "app/Views/register.html")
	})
	mux.HandleFunc("GET /dashboard", app.Portal(models.RoleUser, "app/Views/dashboard.html"))
	mux.HandleFunc("GET /profile", app.Portal(models.RoleUser, "app/Views/profile.html"))
	mux.HandleFunc("GET /admin", app.Portal(models.RoleAdmin, "app/Views/admin.html"))
	mux.HandleFunc("GET /administrator", app.Portal(models.RoleAdministrator, "app/Views/administrator.html"))
	mux.HandleFunc("GET /petugas", app.Portal(models.RolePetugas, "app/Views/collector.html"))
	mux.HandleFunc("GET /collector", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/petugas", http.StatusTemporaryRedirect)
	})
	mux.HandleFunc("POST /logout", app.LogoutHandler)
	mux.HandleFunc("GET /swagger", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "docs/swagger.html")
	})
	mux.HandleFunc("GET /swagger/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/swagger", http.StatusMovedPermanently)
	})
	mux.HandleFunc("GET /swagger/openapi.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=UTF-8")
		http.ServeFile(w, r, "docs/openapi.json")
	})

	mux.Handle("GET /assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir("./assets"))))
	mux.HandleFunc("GET /uploads/{name}", app.PickupPhotoHandler)

	mux.HandleFunc("POST /api/auth/login", app.LoginHandler)
	mux.HandleFunc("POST /api/auth/register", app.RegisterHandler)
	mux.HandleFunc("GET /api/user/profile", app.ProfileGetHandler)
	mux.HandleFunc("POST /api/user/profile", app.ProfileUpdateHandler)
	mux.HandleFunc("GET /api/users/collectors", app.ListCollectorsHandler)
	mux.HandleFunc("GET /api/users/petugas", app.ListCollectorsHandler)
	mux.HandleFunc("GET /api/administrator/session", app.AdministratorSessionHandler)
	mux.HandleFunc("POST /api/ecorecycle/request_pickup", app.RequestPickupHandler)
	mux.HandleFunc("POST /api/ecorecycle/update_pickup", app.UpdatePickupHandler)
	mux.HandleFunc("POST /api/ecorecycle/cancel_pickup", app.CancelPickupHandler)
	mux.HandleFunc("GET /api/ecorecycle/pickup_status", app.PickupStatusGetHandler)
	mux.HandleFunc("POST /api/ecorecycle/pickup_status", app.PickupStatusPostHandler)
	mux.HandleFunc("POST /api/ecorecycle/assign_collector", app.AssignCollectorHandler)
	mux.HandleFunc("POST /api/ecorecycle/estimate_reward", app.EstimateRewardHandler)
	mux.HandleFunc("POST /api/ecorecycle/verify_pickup", app.VerifyPickupHandler)
	mux.HandleFunc("POST /api/ecorecycle/process_payout", app.ProcessPayoutHandler)
	mux.HandleFunc("GET /api/administrator/pickup-rewards", app.PendingRewardsHandler)
	mux.HandleFunc("GET /api/administrator/pickup-rewards/{id}/proof", app.RewardProofHandler)
	mux.HandleFunc("GET /api/ecorecycle/list_pickups", app.ListPickupsHandler)
	mux.HandleFunc("GET /api/ecorecycle/announcements", app.ListAnnouncementsHandler)
	mux.HandleFunc("POST /api/ecorecycle/announcements", app.ManageAnnouncementsHandler)
	mux.HandleFunc("DELETE /api/ecorecycle/announcements", app.DeleteAnnouncementHandler)
	app.RegisterFacilityReports(mux)
	app.RegisterFacilityHandling(mux)
	app.RegisterEducation(mux)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
		if app.AllowBrowserWrite(w, r) {
			mux.ServeHTTP(w, r)
		}
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Server SAMPIRA berjalan di http://localhost:%s\n", port)
	if err := http.ListenAndServe(os.Getenv("SAMPIRA_LISTEN_HOST")+":"+port, handler); err != nil {
		log.Fatalf("Gagal menjalankan server: %v", err)
	}
}
