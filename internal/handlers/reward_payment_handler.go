package handlers

import (
	"context"
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

const rewardReadFailure = "Gagal membaca kewajiban reward."

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

func rewardPaymentFields(r *http.Request) (int, string, string, *apiProblem) {
	id, err := strconv.Atoi(r.PostForm.Get("pickup_id"))
	ref := strings.TrimSpace(r.PostForm.Get("reference"))
	amount := strings.TrimSpace(r.PostForm.Get("amount"))
	if err != nil || id <= 0 {
		return 0, "", "", &apiProblem{"Pilih penjemputan dengan ID yang valid.", http.StatusBadRequest}
	}
	if !transferAmount.MatchString(amount) {
		return 0, "", "", &apiProblem{"Nominal harus berupa angka, maksimal 13 digit dan 2 angka desimal. Gunakan titik untuk desimal, tanpa pemisah ribuan.", http.StatusBadRequest}
	}
	if !transferReference.MatchString(ref) {
		return 0, "", "", &apiProblem{"Referensi transfer harus 6–100 karakter, diawali huruf/angka, dan hanya berisi huruf, angka, titik (.), garis bawah (_), garis miring (/), atau tanda hubung (-). Spasi tidak diperbolehkan.", http.StatusBadRequest}
	}
	if r.PostForm.Get("confirm_payment") != "true" {
		return 0, "", "", &apiProblem{"Centang konfirmasi bahwa nominal, penerima, dan bukti pembayaran sudah diverifikasi.", http.StatusBadRequest}
	}
	return id, amount, ref, nil
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
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			(&apiProblem{"Kiriman bukti terlalu besar. Gunakan gambar hingga 5 MB.", http.StatusRequestEntityTooLarge}).write(w)
			return
		}
		(&apiProblem{"Pembayaran tetap pending. Sertakan bukti dan referensi transfer yang telah diverifikasi.", http.StatusConflict}).write(w)
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
		if files := r.MultipartForm.File["proof"]; len(files) > 0 && files[0].Size > maxPickupImage {
			(&apiProblem{"Bukti pembayaran maksimal 5 MB.", http.StatusRequestEntityTooLarge}).write(w)
			return
		}
	}
	id, amount, ref, problem := rewardPaymentFields(r)
	if problem != nil {
		problem.write(w)
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
	if problem := a.recordRewardPayment(r.Context(), rewardPaymentRecord{ID: id, ActorID: actor.ID, Amount: amount, Reference: ref, ContentType: contentType, Proof: proof}); problem != nil {
		problem.write(w)
		return
	}

	httpx.SendResponse(w, "success", "Pembayaran eksternal tercatat.", map[string]interface{}{"pickup_id": id, "payment_status": "paid"}, http.StatusOK)
}

func (a *App) PendingRewardsHandler(w http.ResponseWriter, r *http.Request) {
	if a.rewardOperator(w, r) == nil {
		return
	}
	rows, err := a.DB.QueryContext(r.Context(), `SELECT p.id,p.tracking_number,r.amount,r.status,r.reference,UNIX_TIMESTAMP(r.paid_at),r.paid_by
  FROM pickup_rewards r JOIN pickups p ON p.id=r.pickup_id
  WHERE r.status IN ('pending','paid') ORDER BY r.status='pending' DESC,r.created_at DESC,p.id DESC`)
	if err != nil {
		(&apiProblem{rewardReadFailure, http.StatusInternalServerError}).write(w)
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
		PaidBy    *int       `json:"paid_by"`
	}
	list := make([]reward, 0)
	for rows.Next() {
		var row reward
		var paidEpoch sql.NullInt64
		if err := rows.Scan(&row.PickupID, &row.Tracking, &row.Amount, &row.Status, &row.Reference, &paidEpoch, &row.PaidBy); err != nil {
			(&apiProblem{rewardReadFailure, http.StatusInternalServerError}).write(w)
			return
		}
		if paidEpoch.Valid {
			paidAt := time.Unix(paidEpoch.Int64, 0).UTC()
			row.PaidAt = &paidAt
		}
		list = append(list, row)
	}
	if rows.Err() != nil {
		(&apiProblem{rewardReadFailure, http.StatusInternalServerError}).write(w)
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

type rewardPaymentRecord struct {
	ID, ActorID                    int
	Amount, Reference, ContentType string
	Proof                          []byte
}

func (a *App) recordRewardPayment(ctx context.Context, payment rewardPaymentRecord) *apiProblem {
	id, amount, ref, proof, contentType := payment.ID, payment.Amount, payment.Reference, payment.Proof, payment.ContentType
	digest := sha256.Sum256(proof)
	tx, err := a.DB.BeginTx(ctx, nil)
	if err != nil {
		return &apiProblem{"Pencatatan belum dapat dipastikan. Periksa riwayat pembayaran sebelum mencoba lagi.", http.StatusInternalServerError}
	}
	defer tx.Rollback()
	var packetLimit int64
	if err = tx.QueryRowContext(ctx, "SELECT @@max_allowed_packet").Scan(&packetLimit); err != nil {
		return &apiProblem{"Kapasitas unggahan belum dapat diperiksa. Coba lagi setelah memeriksa riwayat.", http.StatusInternalServerError}
	}
	if int64(len(proof)) > packetLimit-(64<<10) {
		return &apiProblem{"Bukti terlalu besar untuk penyimpanan server. Perkecil gambar atau gunakan optimasi pada form pembayaran.", http.StatusRequestEntityTooLarge}
	}
	// The conditional update records proof and the actor with the paid state in a single write.
	res, err := tx.ExecContext(ctx, `UPDATE pickup_rewards
  SET status='paid', reference=?, proof=?, proof_type=?, proof_digest=?, paid_by=?, paid_at=CURRENT_TIMESTAMP
  WHERE pickup_id=? AND status='pending' AND amount=CAST(? AS DECIMAL(15,2))`,
		ref, proof, contentType, digest[:], payment.ActorID, id, amount)
	if err != nil {
		var dbErr *mysql.MySQLError
		if errors.As(err, &dbErr) && dbErr.Number == 1062 {
			return &apiProblem{"Referensi atau bukti pembayaran telah digunakan.", http.StatusConflict}
		}
		return &apiProblem{"Gagal mencatat pembayaran.", http.StatusInternalServerError}
	}
	count, err := res.RowsAffected()
	if err != nil || count != 1 {
		return &apiProblem{"Kewajiban pending tidak ditemukan, sudah dibayar, atau nominal berbeda.", http.StatusConflict}
	}
	if err = tx.Commit(); err != nil {
		return &apiProblem{"Pencatatan belum dapat dipastikan. Periksa riwayat pembayaran sebelum mencoba lagi.", http.StatusInternalServerError}
	}
	return nil
}
