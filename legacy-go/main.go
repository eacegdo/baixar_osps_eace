package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"bubble-csv/internal/bubble"
)

type server struct {
	client *bubble.Client
	apiKey string // optional key protecting this API itself
}

func main() {
	baseURL := os.Getenv("BUBBLE_BASE_URL")
	if baseURL == "" {
		log.Fatal("BUBBLE_BASE_URL is required, e.g. https://myapp.bubbleapps.io/api/1.1/obj")
	}
	token := os.Getenv("BUBBLE_TOKEN")
	if token == "" {
		log.Fatal("BUBBLE_TOKEN is required")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	s := &server{
		client: bubble.New(baseURL, token),
		apiKey: os.Getenv("API_KEY"),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /export/{table}", s.handleExport)

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      15 * time.Minute, // large exports take a while
	}

	log.Printf("listening on :%s", port)
	log.Fatal(srv.ListenAndServe())
}

func (s *server) handleExport(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		httpError(w, http.StatusUnauthorized, "invalid or missing API key")
		return
	}

	table := r.PathValue("table")
	if table == "" {
		httpError(w, http.StatusBadRequest, "missing table name")
		return
	}

	q := r.URL.Query()
	opts := bubble.ListOptions{
		Constraints: q.Get("constraints"),
		SortField:   q.Get("sort_field"),
		Descending:  q.Get("descending") == "true",
	}
	if opts.Constraints != "" && !json.Valid([]byte(opts.Constraints)) {
		httpError(w, http.StatusBadRequest, "constraints must be a valid JSON array")
		return
	}

	maxRows := 0
	if v := q.Get("max_rows"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			httpError(w, http.StatusBadRequest, "max_rows must be a non-negative integer")
			return
		}
		maxRows = n
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Minute)
	defer cancel()

	// Buffer every page: the CSV header is the union of the keys across all
	// records, and Bubble omits empty fields, so it is only known at the end.
	var records []bubble.Record
	err := s.client.FetchAll(ctx, table, opts, func(page []bubble.Record) error {
		records = append(records, page...)
		if maxRows > 0 && len(records) >= maxRows {
			records = records[:maxRows]
			return errEnough
		}
		return nil
	})
	if err != nil && err != errEnough {
		log.Printf("export %s failed: %v", table, err)
		httpError(w, http.StatusBadGateway, err.Error())
		return
	}

	cols := bubble.Columns(records)
	filename := fmt.Sprintf("%s-%s.csv", sanitize(table), time.Now().UTC().Format("20060102-150405"))

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("X-Row-Count", strconv.Itoa(len(records)))

	// Excel on Windows needs the BOM to read UTF-8 accents correctly.
	if q.Get("bom") != "false" {
		w.Write([]byte{0xEF, 0xBB, 0xBF})
	}

	cw := csv.NewWriter(w)
	if sep := q.Get("sep"); sep != "" {
		cw.Comma = []rune(sep)[0]
	}
	if err := bubble.WriteCSV(cw, cols, records); err != nil {
		log.Printf("writing csv for %s: %v", table, err)
		return
	}
	cw.Flush()
}

// errEnough unwinds FetchAll once max_rows is reached.
var errEnough = fmt.Errorf("row limit reached")

func (s *server) authorized(r *http.Request) bool {
	if s.apiKey == "" {
		return true
	}
	got := r.Header.Get("X-API-Key")
	if got == "" {
		got = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	}
	return got == s.apiKey
}

func sanitize(s string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			return r
		default:
			return '-'
		}
	}, s)
}

func httpError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
