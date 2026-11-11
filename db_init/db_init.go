package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"

	_ "github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"
)

// Loader file .env sederhana
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

const insertWasteCategorySQL = "INSERT INTO waste_categories (category_name, description, reward_per_kg, processing_fee_per_kg) VALUES (?, ?, ?, ?)"

type initialAccount struct {
	name, email, role, password, hash string
	generated                         bool
}

func prepareInitialAccounts(getenv func(string) string) ([]initialAccount, error) {
	accounts := []initialAccount{
		{name: "User Demo SAMPIRA", email: "user@eco.com", role: "user", password: getenv("SAMPIRA_INITIAL_USER_PASSWORD")},
		{name: "Petugas Demo SAMPIRA", email: "petugas@eco.com", role: "petugas", password: getenv("SAMPIRA_INITIAL_PETUGAS_PASSWORD")},
		{name: "Admin SAMPIRA", email: "admin@eco.com", role: "admin", password: getenv("SAMPIRA_INITIAL_ADMIN_PASSWORD")},
		{name: "Administrator SAMPIRA", email: "administrator@eco.com", role: "administrator", password: getenv("SAMPIRA_INITIAL_ADMINISTRATOR_PASSWORD")},
	}
	for i := range accounts {
		account := &accounts[i]
		if account.password == "" {
			secret := make([]byte, 16)
			if _, err := rand.Read(secret); err != nil {
				return nil, err
			}
			account.password = hex.EncodeToString(secret)
			account.generated = true
		}
		if len(account.password) < 15 || len(account.password) > 72 {
			return nil, fmt.Errorf("password awal role %s harus 15–72 byte", account.role)
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(account.password), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		account.hash = string(hash)
	}
	return accounts, nil
}

func seedInitialAccounts(conn *sql.Conn, accounts []initialAccount) error {
	ctx := context.Background()
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, account := range accounts {
		if _, err := tx.ExecContext(ctx, "INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)", account.name, account.email, account.hash, account.role); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func main() {
	loadEnv()
	accounts, err := prepareInitialAccounts(os.Getenv)
	if err != nil {
		log.Fatal(err)
	}

	host := os.Getenv("DB_HOST")
	if host == "" {
		host = "localhost"
	}
	user := os.Getenv("DB_USER")
	if user == "" {
		user = "root"
	}
	pass := os.Getenv("DB_PASS")

	if !strings.Contains(host, ":") {
		host = host + ":3306"
	}

	var dsn string
	if pass == "" {
		dsn = fmt.Sprintf("%s@tcp(%s)/", user, host)
	} else {
		dsn = fmt.Sprintf("%s:%s@tcp(%s)/", user, pass, host)
	}

	fmt.Printf("Menghubungkan ke MySQL di %s...\n", host)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Gagal inisialisasi driver DB: %v", err)
	}
	defer db.Close()

	err = db.Ping()
	if err != nil {
		log.Fatalf("Koneksi gagal: %v\nPastikan MySQL/MariaDB server Anda sudah aktif.", err)
	}

	// CREATE DATABASE without IF NOT EXISTS stops on a previously initialized schema.
	dbName := os.Getenv("DB_NAME")
	if dbName == "" {
		dbName = "ecorecycle"
	}
	if !regexp.MustCompile("^[A-Za-z0-9_]+$").MatchString(dbName) {
		log.Fatal("DB_NAME hanya boleh berisi huruf, angka, atau garis bawah.")
	}
	conn, err := db.Conn(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()
	if _, err := conn.ExecContext(context.Background(), "CREATE DATABASE "+dbName); err != nil {
		log.Fatalf("Inisialisasi hanya untuk database baru: %v", err)
	}
	if _, err := conn.ExecContext(context.Background(), "USE "+dbName); err != nil {
		log.Fatal(err)
	}

	// 2. Buat Tabel 'users'
	sqlUsers := `CREATE TABLE IF NOT EXISTS users (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		name VARCHAR(100) NOT NULL,
		email VARCHAR(100) NOT NULL UNIQUE,
		password VARCHAR(255) NOT NULL,
		role ENUM('admin', 'user', 'petugas', 'administrator') DEFAULT 'user',
		phone VARCHAR(30) DEFAULT NULL,
		address TEXT DEFAULT NULL,
		payout_method VARCHAR(30) DEFAULT NULL,
		payout_account_name VARCHAR(120) DEFAULT NULL,
		payout_account_number VARCHAR(80) DEFAULT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`
	_, err = conn.ExecContext(context.Background(), sqlUsers)
	if err != nil {
		log.Fatalf("Gagal membuat tabel users: %v", err)
	}
	fmt.Println("Tabel 'users' berhasil dibuat.")

	// 3. Buat Tabel 'waste_categories'
	sqlCategories := `CREATE TABLE IF NOT EXISTS waste_categories (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		category_name VARCHAR(50) NOT NULL,
		description VARCHAR(255),
		reward_per_kg DECIMAL(10,2) NOT NULL,
		processing_fee_per_kg DECIMAL(10,2) NOT NULL
	)`
	_, err = conn.ExecContext(context.Background(), sqlCategories)
	if err != nil {
		log.Fatalf("Gagal membuat tabel waste_categories: %v", err)
	}
	fmt.Println("Tabel 'waste_categories' berhasil dibuat.")

	// 4. Buat Tabel 'pickups'
	sqlPickups := `CREATE TABLE IF NOT EXISTS pickups (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		user_id INT(11) NOT NULL,
		collector_id INT(11) DEFAULT NULL,
		tracking_number VARCHAR(50) UNIQUE NOT NULL,
		item_description TEXT,
		pickup_address TEXT,
		contact_phone VARCHAR(20),
		weight_kg DECIMAL(10,2),
		category_id INT(11),
		eco_reward DECIMAL(15,2),
		processing_fee DECIMAL(15,2),
		final_weight_kg DECIMAL(10,2) DEFAULT NULL,
		final_eco_reward DECIMAL(15,2) DEFAULT NULL,
		final_processing_fee DECIMAL(15,2) DEFAULT NULL,
		verification_notes TEXT DEFAULT NULL,
		verified_at TIMESTAMP NULL DEFAULT NULL,
		photo_url VARCHAR(255) DEFAULT NULL,
		is_processed BOOLEAN DEFAULT FALSE,
		status VARCHAR(50) DEFAULT 'pending',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (collector_id) REFERENCES users(id) ON DELETE SET NULL,
		FOREIGN KEY (category_id) REFERENCES waste_categories(id)
	)`
	_, err = conn.ExecContext(context.Background(), sqlPickups)
	if err != nil {
		log.Fatalf("Gagal membuat tabel pickups: %v", err)
	}
	fmt.Println("Tabel 'pickups' berhasil dibuat.")

	// 5. Buat Tabel 'pickup_history'
	sqlHistory := `CREATE TABLE IF NOT EXISTS pickup_history (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		pickup_id INT(11) NOT NULL,
		status VARCHAR(50) NOT NULL,
		location VARCHAR(100),
		notes TEXT,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (pickup_id) REFERENCES pickups(id) ON DELETE CASCADE
	)`
	_, err = conn.ExecContext(context.Background(), sqlHistory)
	if err != nil {
		log.Fatalf("Gagal membuat tabel pickup_history: %v", err)
	}
	fmt.Println("Tabel 'pickup_history' berhasil dibuat.")

	// 6. Buat Tabel 'transactions'
	sqlTransactions := `CREATE TABLE IF NOT EXISTS transactions (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		pickup_id INT(11) NOT NULL,
		transaction_ref VARCHAR(100) NOT NULL,
		amount DECIMAL(15,2) NOT NULL,
		transaction_type VARCHAR(50),
		status VARCHAR(50) DEFAULT 'success',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (pickup_id) REFERENCES pickups(id) ON DELETE CASCADE
	)`
	_, err = conn.ExecContext(context.Background(), sqlTransactions)
	if err != nil {
		log.Fatalf("Gagal membuat tabel transactions: %v", err)
	}
	fmt.Println("Tabel 'transactions' berhasil dibuat.")

	// CMS pengumuman internal untuk portal berbasis peran.
	sqlAnnouncements := `CREATE TABLE IF NOT EXISTS portal_announcements (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		title VARCHAR(120) NOT NULL,
		message TEXT NOT NULL,
		target_role ENUM('all', 'user', 'petugas') NOT NULL DEFAULT 'all',
		is_active BOOLEAN NOT NULL DEFAULT TRUE,
		created_by INT(11) DEFAULT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
	)`
	_, err = conn.ExecContext(context.Background(), sqlAnnouncements)
	if err != nil {
		log.Fatalf("Gagal membuat tabel portal_announcements: %v", err)
	}
	fmt.Println("Tabel 'portal_announcements' berhasil dibuat.")

	// 8. Seeding Kategori Sampah
	_, err = conn.ExecContext(context.Background(), insertWasteCategorySQL, "Small Gadgets", "Smartphone, Tablet, Smartwatch, Kamera Digital", 5000.0, 500.0)
	if err != nil {
		log.Fatalf("Gagal seeding category Small Gadgets: %v", err)
	}
	_, err = conn.ExecContext(context.Background(), insertWasteCategorySQL, "Computers", "Laptop, Motherboard, RAM, CPU", 7000.0, 1000.0)
	if err != nil {
		log.Fatalf("Gagal seeding category Computers: %v", err)
	}
	_, err = conn.ExecContext(context.Background(), insertWasteCategorySQL, "Large Appliances", "Televisi, Kulkas, Pendingin Ruangan (AC), Mesin Cuci", 10000.0, 5000.0)
	if err != nil {
		log.Fatalf("Gagal seeding category Large Appliances: %v", err)
	}
	_, err = conn.ExecContext(context.Background(), insertWasteCategorySQL, "Batteries", "Baterai Lithium-Ion, Lead-Acid, UPS Battery", 3000.0, 2000.0)
	if err != nil {
		log.Fatalf("Gagal seeding category Batteries: %v", err)
	}

	// General waste categories. Existing databases use add_waste_categories.sql instead.
	for _, category := range []struct {
		name, description string
		rate              float64
	}{
		{"Organik", "Sisa makanan, kulit buah, sayur, dan daun terpilah; tanpa reward", 0},
		{"Plastik PET", "Anorganik: botol PET bening bersih dan terpilah", 3000},
		{"Kertas dan Kardus", "Anorganik: kertas dan kardus bersih serta kering", 1000},
		{"Besi", "Anorganik: besi bekas terpilah", 2500},
		{"Kaca", "Anorganik: botol kaca dan beling terpilah", 150},
		{"B3 Rumah Tangga", "Lampu dan kemasan bekas B3 rumah tangga; bukan limbah medis atau industri; tanpa reward awal", 0},
	} {
		if _, err := conn.ExecContext(context.Background(), insertWasteCategorySQL, category.name, category.description, category.rate, 0); err != nil {
			log.Fatalf("Gagal seeding kategori %s: %v", category.name, err)
		}
	}

	if err := seedInitialAccounts(conn, accounts); err != nil {
		log.Fatalf("Gagal membuat akun awal: %v", err)
	}
	fmt.Println("Database baru siap. Akun awal:")
	for _, account := range accounts {
		fmt.Printf("Role: %s | Email: %s\n", account.role, account.email)
		if account.generated {
			fmt.Printf("Password awal: %s\n", account.password)
		} else {
			fmt.Println("Password: sesuai konfigurasi lokal .env.")
		}
	}
	fmt.Println("Simpan password awal secara privat. Jangan commit .env atau hasil terminal ke repository.")
}
