package main

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

// Loader file .env sederhana.
// Environment variable dari Railway tetap diprioritaskan.
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
				_ = os.Setenv(key, value)
			}
		}
	}

	if err := scanner.Err(); err != nil {
		log.Fatalf("Gagal membaca .env: %v", err)
	}
}

const insertWasteCategorySQL = `
INSERT INTO waste_categories
(category_name, description, reward_per_kg, processing_fee_per_kg)
VALUES (?, ?, ?, ?)
`

func main() {
	loadEnv()

	ctx := context.Background()

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

	// Validasi nama database untuk keamanan SQL.
	if !regexp.MustCompile(`^[A-Za-z0-9_]+$`).MatchString(dbName) {
		log.Fatal("DB_NAME hanya boleh berisi huruf, angka, atau garis bawah.")
	}

	if !strings.Contains(host, ":") {
		host += ":3306"
	}

	// Langsung gunakan database yang sudah ada.
	var dsn string
	if pass == "" {
		dsn = fmt.Sprintf(
			"%s@tcp(%s)/%s?parseTime=true",
			user,
			host,
			dbName,
		)
	} else {
		dsn = fmt.Sprintf(
			"%s:%s@tcp(%s)/%s?parseTime=true",
			user,
			pass,
			host,
			dbName,
		)
	}

	fmt.Printf(
		"Menghubungkan ke MariaDB %s, database %s...\n",
		host,
		dbName,
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Gagal membuka driver database: %v", err)
	}
	defer db.Close()

	if err := db.PingContext(ctx); err != nil {
		log.Fatalf("Koneksi MariaDB gagal: %v", err)
	}

	fmt.Println("Koneksi MariaDB berhasil.")

	// =====================================================
	// KEAMANAN INISIALISASI
	// =====================================================
	// Program ini hanya untuk database yang masih kosong.
	// Mencegah seeding berulang dan perubahan tak sengaja
	// pada database yang telah digunakan.
	// =====================================================

	var existingTables int

	err = db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM information_schema.tables
		WHERE table_schema = ?
		  AND table_type = 'BASE TABLE'
	`, dbName).Scan(&existingTables)

	if err != nil {
		log.Fatalf(
			"Gagal memeriksa struktur database: %v",
			err,
		)
	}

	if existingTables > 0 {
		log.Fatalf(
			"Inisialisasi dibatalkan: database %s sudah memiliki %d tabel. "+
				"Program ini hanya untuk database kosong.",
			dbName,
			existingTables,
		)
	}

	fmt.Println("Database kosong. Memulai inisialisasi...")

	// =====================================================
	// 1. TABEL USERS
	// =====================================================

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

	if _, err := db.ExecContext(ctx, sqlUsers); err != nil {
		log.Fatalf("Gagal membuat tabel users: %v", err)
	}

	fmt.Println("Tabel users berhasil dibuat.")

	// =====================================================
	// 2. TABEL WASTE CATEGORIES
	// =====================================================

	sqlCategories := `CREATE TABLE IF NOT EXISTS waste_categories (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		category_name VARCHAR(50) NOT NULL,
		description VARCHAR(255),
		reward_per_kg DECIMAL(10,2) NOT NULL,
		processing_fee_per_kg DECIMAL(10,2) NOT NULL
	)`

	if _, err := db.ExecContext(ctx, sqlCategories); err != nil {
		log.Fatalf(
			"Gagal membuat tabel waste_categories: %v",
			err,
		)
	}

	fmt.Println("Tabel waste_categories berhasil dibuat.")

	// =====================================================
	// 3. TABEL PICKUPS
	// =====================================================

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
		FOREIGN KEY (user_id)
			REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (collector_id)
			REFERENCES users(id) ON DELETE SET NULL,
		FOREIGN KEY (category_id)
			REFERENCES waste_categories(id)
	)`

	if _, err := db.ExecContext(ctx, sqlPickups); err != nil {
		log.Fatalf("Gagal membuat tabel pickups: %v", err)
	}

	fmt.Println("Tabel pickups berhasil dibuat.")

	// =====================================================
	// 4. TABEL PICKUP HISTORY
	// =====================================================

	sqlHistory := `CREATE TABLE IF NOT EXISTS pickup_history (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		pickup_id INT(11) NOT NULL,
		status VARCHAR(50) NOT NULL,
		location VARCHAR(100),
		notes TEXT,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (pickup_id)
			REFERENCES pickups(id) ON DELETE CASCADE
	)`

	if _, err := db.ExecContext(ctx, sqlHistory); err != nil {
		log.Fatalf(
			"Gagal membuat tabel pickup_history: %v",
			err,
		)
	}

	fmt.Println("Tabel pickup_history berhasil dibuat.")

	// =====================================================
	// 5. TABEL TRANSACTIONS
	// =====================================================

	sqlTransactions := `CREATE TABLE IF NOT EXISTS transactions (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		pickup_id INT(11) NOT NULL,
		transaction_ref VARCHAR(100) NOT NULL,
		amount DECIMAL(15,2) NOT NULL,
		transaction_type VARCHAR(50),
		status VARCHAR(50) DEFAULT 'success',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (pickup_id)
			REFERENCES pickups(id) ON DELETE CASCADE
	)`

	if _, err := db.ExecContext(ctx, sqlTransactions); err != nil {
		log.Fatalf(
			"Gagal membuat tabel transactions: %v",
			err,
		)
	}

	fmt.Println("Tabel transactions berhasil dibuat.")

	// =====================================================
	// 6. TABEL PORTAL ANNOUNCEMENTS
	// =====================================================

	sqlAnnouncements := `CREATE TABLE IF NOT EXISTS portal_announcements (
		id INT(11) AUTO_INCREMENT PRIMARY KEY,
		title VARCHAR(120) NOT NULL,
		message TEXT NOT NULL,
		target_role ENUM('all', 'user', 'petugas')
			NOT NULL DEFAULT 'all',
		is_active BOOLEAN NOT NULL DEFAULT TRUE,
		created_by INT(11) DEFAULT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (created_by)
			REFERENCES users(id) ON DELETE SET NULL
	)`

	if _, err := db.ExecContext(ctx, sqlAnnouncements); err != nil {
		log.Fatalf(
			"Gagal membuat tabel portal_announcements: %v",
			err,
		)
	}

	fmt.Println("Tabel portal_announcements berhasil dibuat.")

	// =====================================================
	// 7. SEEDING KATEGORI SAMPAH
	// =====================================================

	type WasteCategory struct {
		name        string
		description string
		reward      float64
		fee         float64
	}

	categories := []WasteCategory{
		{
			"Small Gadgets",
			"Smartphone, Tablet, Smartwatch, Kamera Digital",
			5000,
			500,
		},
		{
			"Computers",
			"Laptop, Motherboard, RAM, CPU",
			7000,
			1000,
		},
		{
			"Large Appliances",
			"Televisi, Kulkas, Pendingin Ruangan (AC), Mesin Cuci",
			10000,
			5000,
		},
		{
			"Batteries",
			"Baterai Lithium-Ion, Lead-Acid, UPS Battery",
			3000,
			2000,
		},
		{
			"Organik",
			"Sisa makanan, kulit buah, sayur, dan daun terpilah; tanpa reward",
			0,
			0,
		},
		{
			"Plastik PET",
			"Anorganik: botol PET bening bersih dan terpilah",
			3000,
			0,
		},
		{
			"Kertas dan Kardus",
			"Anorganik: kertas dan kardus bersih serta kering",
			1000,
			0,
		},
		{
			"Besi",
			"Anorganik: besi bekas terpilah",
			2500,
			0,
		},
		{
			"Kaca",
			"Anorganik: botol kaca dan beling terpilah",
			150,
			0,
		},
		{
			"B3 Rumah Tangga",
			"Lampu dan kemasan bekas B3 rumah tangga; bukan limbah medis atau industri; tanpa reward awal",
			0,
			0,
		},
	}

	for _, category := range categories {
		_, err := db.ExecContext(
			ctx,
			insertWasteCategorySQL,
			category.name,
			category.description,
			category.reward,
			category.fee,
		)

		if err != nil {
			log.Fatalf(
				"Gagal seeding kategori %s: %v",
				category.name,
				err,
			)
		}

		fmt.Printf(
			"Kategori %s berhasil ditambahkan.\n",
			category.name,
		)
	}

	// =====================================================
	// SELESAI
	// =====================================================

	fmt.Println("=======================================")
	fmt.Println("DATABASE SAMPIRA BERHASIL DIINISIALISASI")
	fmt.Println("=======================================")
	fmt.Printf("Database: %s\n", dbName)
	fmt.Printf("Kategori awal: %d\n", len(categories))
	fmt.Println("Selanjutnya jalankan server SAMPIRA.")
}
