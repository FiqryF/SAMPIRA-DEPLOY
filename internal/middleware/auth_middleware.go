package middleware

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type Response struct {
	Status  string      `json:"status"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func SendResponse(w http.ResponseWriter, status string, message string, data interface{}, httpCode int) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(httpCode)
	json.NewEncoder(w).Encode(Response{
		Status:  status,
		Message: message,
		Data:    data,
	})
}

func RequestData(r *http.Request) map[string]string {
	data := make(map[string]string)
	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "application/json") {
		var jsonMap map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&jsonMap); err == nil {
			for k, v := range jsonMap {
				switch val := v.(type) {
				case string:
					data[k] = val
				case float64:
					data[k] = fmt.Sprintf("%g", val)
				case bool:
					data[k] = fmt.Sprintf("%t", val)
				}
			}
		}
		return data
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil && err != http.ErrNotMultipart {
		return data
	}
	for k, v := range r.PostForm {
		if len(v) > 0 {
			data[k] = v[0]
		}
	}
	return data
}
