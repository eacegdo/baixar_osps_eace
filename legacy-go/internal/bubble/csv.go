package bubble

import (
	"encoding/csv"
	"encoding/json"
	"math"
	"sort"
	"strconv"
)

// preferredFirst are Bubble's built-in fields; they lead the header when present.
var preferredFirst = []string{"_id", "Created Date", "Modified Date", "Created By", "Slug"}

// Columns returns the union of every key seen across records, with the built-in
// Bubble fields first and the remaining custom fields sorted alphabetically.
func Columns(records []Record) []string {
	seen := make(map[string]bool)
	for _, r := range records {
		for k := range r {
			seen[k] = true
		}
	}

	cols := make([]string, 0, len(seen))
	for _, k := range preferredFirst {
		if seen[k] {
			cols = append(cols, k)
			delete(seen, k)
		}
	}

	rest := make([]string, 0, len(seen))
	for k := range seen {
		rest = append(rest, k)
	}
	sort.Strings(rest)
	return append(cols, rest...)
}

// Format renders a JSON value as a CSV cell. Nested objects and lists are kept
// as compact JSON so nothing is silently dropped from the export.
func Format(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case bool:
		return strconv.FormatBool(t)
	case float64:
		if t == math.Trunc(t) && math.Abs(t) < 1e15 {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case json.Number:
		return t.String()
	default:
		b, err := json.Marshal(t)
		if err != nil {
			return ""
		}
		return string(b)
	}
}

// WriteCSV writes the header plus every record, in the given column order.
func WriteCSV(w *csv.Writer, cols []string, records []Record) error {
	if err := w.Write(cols); err != nil {
		return err
	}
	row := make([]string, len(cols))
	for _, r := range records {
		for i, c := range cols {
			row[i] = Format(r[c])
		}
		if err := w.Write(row); err != nil {
			return err
		}
	}
	return w.Error()
}
