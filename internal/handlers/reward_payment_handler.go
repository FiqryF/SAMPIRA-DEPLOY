package handlers

import (
	"crypto/sha256"
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	httpx "ecorecycle/internal/middleware"
	"ecorecycle/internal/models"
	"github.com/go-sql-driver/mysql"
)

var transferReference = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]{5,99}$`)
var transferAmount = regexp.MustCompile(`^[0-9]{1,13}(\.[0-9]{1,2})?$`)

func (a *App) rewardOperator(w http.ResponseWriter, r *http.Request) *models.TokenPayload {
	actor, err := a.apiSession(r)
	if err != nil {
		(&apiProblem{err.Error(), http.StatusUnauthorized}).write(w)
		return nil
	}
	if actor.Role != models.RoleAdministrator {
		(&apiProblem{"Pencatatan pembayaran memerlukan Administrator.", http.StatusForbidden}).write(w)
		return nil
	}
	return actor
}

func (a *App) ProcessPayoutHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		(&apiProblem{methodNotAllowedMessage, http.StatusMethodNotAllowed}).write(w)
		return
	}
	actor := a.rewardOperator(w, r)
	if actor == nil {
		return
	}
	// Payment fields must come from the multipart body, never from query parameters.
	if err := r.ParseMultipartForm(6 << 20); err != nil {
		(&apiProblem{"Pembayaran tetap pending. Sertakan bukti dan referensi transfer yang telah diverifikasi.", http.StatusConflict}).write(w)
		return
	}
	id, err := strconv.Atoi(r.PostForm.Get("pickup_id"))
	ref := strings.TrimSpace(r.PostForm.Get("reference"))
	amount := strings.TrimSpace(r.PostForm.Get("amount"))
	if err != nil || id <= 0 || !transferReference.MatchString(ref) || !transferAmount.MatchString(amount) || r.PostForm.Get("confirm_payment") != "true" {
		(&apiProblem{"ID, nominal, referensi transfer, dan konfirmasi verifikasi wajib valid.", http.StatusBadRequest}).write(w)
		return
	}
	proof, _, contentType, problem := readPickupImage(r, "proof")
	if problem != nil {
		problem.write(w)
		return
	}
	if proof == nil {
		(&apiProblem{"Bukti pembayaran wajib diunggah.", http.StatusBadRequest}).write(w)
		return
	}
	digest := sha256.Sum256(proof)
	// The conditional update records proof and the actor with the paid state in a single write.
	res, err := a.DB.ExecContext(r.Context(), `UPDATE pickup_rewards
  SET status='paid', reference=?, proof=?, proof_type=?, proof_digest=?, paid_by=?, paid_at=CURRENT_TIMESTAMP
  WHERE pickup_id=? AND status='pending' AND amount=CAST(? AS DECIMAL(15,2))`,
		ref, proof, contentType, digest[:], actor.ID, id, amount)
	if err != nil {
		var dbErr *mysql.MySQLError
		if errors.As(err, &dbErr) && dbErr.Number == 1062 {
			(&apiProblem{"Referensi atau bukti pembayaran telah digunakan.", http.StatusConflict}).write(w)
			return
		}
		(&apiProblem{"Gagal mencatat pembayaran.", http.StatusInternalServerError}).write(w)
		return
	}
	count, err := res.RowsAffected()
	if err != nil || count != 1 {
		(&apiProblem{"Kewajiban pending tidak ditemukan, sudah dibayar, atau nominal berbeda.", http.StatusConflict}).write(w)
		return
	}
	httpx.SendResponse(w, "success", "Pembayaran eksternal tercatat.", map[string]interface{}{"pickup_id": id, "payment_status": "paid"}, http.StatusOK)
}

func (a *App) PendingRewardsHandler(w http.ResponseWriter, r *http.Request) {
	if a.rewardOperator(w, r) == nil {
		return
	}
	rows, err := a.DB.QueryContext(r.Context(), `SELECT p.id,p.tracking_number,r.amount,r.status,r.reference,r.paid_at
  FROM pickup_rewards r JOIN pickups p ON p.id=r.pickup_id
  WHERE r.status IN ('pending','paid') ORDER BY r.status='pending' DESC,r.created_at DESC,p.id DESC`)
	if err != nil {
		(&apiProblem{"Gagal membaca kewajiban reward.", http.StatusInternalServerError}).write(w)
		return
	}
	defer rows.Close()
	type reward struct {
		PickupID  int        `json:"pickup_id"`
		Tracking  string     `json:"tracking_number"`
		Amount    string     `json:"amount"`
		Status    string     `json:"status"`
		Reference *string    `json:"reference"`
		PaidAt    *time.Time `json:"paid_at"`
	}
	list := make([]reward, 0)
	for rows.Next() {
		var row reward
		if err := rows.Scan(&row.PickupID, &row.Tracking, &row.Amount, &row.Status, &row.Reference, &row.PaidAt); err != nil {
			(&apiProblem{"Gagal membaca kewajiban reward.", http.StatusInternalServerError}).write(w)
			return
		}
		list = append(list, row)
	}
	if rows.Err() != nil {
		(&apiProblem{"Gagal membaca kewajiban reward.", http.StatusInternalServerError}).write(w)
		return
	}
	httpx.SendResponse(w, "success", "Daftar kewajiban reward.", list, http.StatusOK)
}

func (a *App) RewardProofHandler(w http.ResponseWriter, r *http.Request) {
	if a.rewardOperator(w, r) == nil {
		return
	}
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		http.NotFound(w, r)
		return
	}
	var proof []byte
	var contentType string
	err = a.DB.QueryRowContext(r.Context(), "SELECT proof, proof_type FROM pickup_rewards WHERE pickup_id=? AND status='paid'", id).Scan(&proof, &contentType)
	if err == sql.ErrNoRows {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, "Gagal membaca bukti.", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", "attachment")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("Content-Type", contentType)
	w.Write(proof)
}
