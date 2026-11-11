package main

import (
	"bufio"
	"fmt"
	"io"
	"net/mail"
	"strings"

	"ecorecycle/internal/models"
	"ecorecycle/internal/repositories"
	"golang.org/x/crypto/bcrypt"
)

func bootstrapAdministrator(users *repositories.UserRepository, args []string, input io.Reader) error {
	if len(args) != 2 || strings.TrimSpace(args[0]) == "" || len(args[0]) > 100 {
		return fmt.Errorf("penggunaan: server -bootstrap-administrator NAMA EMAIL (password dari stdin)")
	}
	address, err := mail.ParseAddress(args[1])
	if err != nil || address.Address != args[1] || len(args[1]) > 100 {
		return fmt.Errorf("email Administrator tidak valid")
	}

	scanner := bufio.NewScanner(input)
	if !scanner.Scan() {
		return fmt.Errorf("password Administrator wajib dikirim melalui stdin")
	}
	password := scanner.Bytes()
	if len(password) < 15 || len(password) > 72 {
		return fmt.Errorf("password Administrator harus 15 hingga 72 byte")
	}
	hash, err := bcrypt.GenerateFromPassword(password, bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := users.Create(args[0], args[1], string(hash), models.RoleAdministrator); err != nil {
		return fmt.Errorf("gagal membuat akun baru, periksa email unik dan migrasi role: %w", err)
	}
	return nil
}
