package bubble

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Record is a single Bubble "thing" as returned by the Data API.
type Record map[string]any

// Client talks to the Bubble Data API.
type Client struct {
	BaseURL string // e.g. https://myapp.bubbleapps.io/api/1.1/obj  (or /version-test/api/1.1/obj)
	Token   string
	HTTP    *http.Client
}

// New builds a client. baseURL must point at the /obj root, without a trailing slash.
func New(baseURL, token string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Token:   token,
		HTTP:    &http.Client{Timeout: 60 * time.Second},
	}
}

// ListOptions controls a single table export.
type ListOptions struct {
	Constraints string // raw JSON array, passed through as the `constraints` param
	SortField   string
	Descending  bool
	PageSize    int // Bubble caps this at 100
}

type listResponse struct {
	Response struct {
		Cursor    int      `json:"cursor"`
		Results   []Record `json:"results"`
		Remaining int      `json:"remaining"`
		Count     int      `json:"count"`
	} `json:"response"`
}

// FetchAll pages through the whole table, invoking fn for every page in order.
// It stops when Bubble reports no remaining records.
func (c *Client) FetchAll(ctx context.Context, table string, opts ListOptions, fn func([]Record) error) error {
	limit := opts.PageSize
	if limit <= 0 || limit > 100 {
		limit = 100
	}

	cursor := 0
	for {
		page, err := c.fetchPage(ctx, table, opts, cursor, limit)
		if err != nil {
			return err
		}
		if len(page.Response.Results) > 0 {
			if err := fn(page.Response.Results); err != nil {
				return err
			}
		}
		if page.Response.Remaining <= 0 || len(page.Response.Results) == 0 {
			return nil
		}
		cursor += len(page.Response.Results)
	}
}

func (c *Client) fetchPage(ctx context.Context, table string, opts ListOptions, cursor, limit int) (*listResponse, error) {
	q := url.Values{}
	q.Set("cursor", strconv.Itoa(cursor))
	q.Set("limit", strconv.Itoa(limit))
	if opts.Constraints != "" {
		q.Set("constraints", opts.Constraints)
	}
	if opts.SortField != "" {
		q.Set("sort_field", opts.SortField)
		q.Set("descending", strconv.FormatBool(opts.Descending))
	}

	endpoint := c.BaseURL + "/" + url.PathEscape(table) + "?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bubble request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("bubble returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var out listResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decoding bubble response: %w", err)
	}
	return &out, nil
}
