package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// DefaultBaseURL points at a local `bun run dev`. Override with LUCARNE_API to
// aim the client at the deployed instance.
const DefaultBaseURL = "http://localhost:3000"

// Client talks to the Lucarne API.
type Client struct {
	BaseURL string
	HTTP    *http.Client
}

// New returns a client honouring LUCARNE_API.
func New() *Client {
	base := os.Getenv("LUCARNE_API")
	if base == "" {
		base = DefaultBaseURL
	}
	return &Client{
		BaseURL: strings.TrimRight(base, "/"),
		// A TUI that hangs is worse than one that reports an error: the user
		// cannot tell a slow network from a wedged program.
		HTTP: &http.Client{Timeout: 10 * time.Second},
	}
}

func get[T any](ctx context.Context, c *Client, path string, out *T) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: %s", path, res.Status)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// Schedule returns fixtures for a window of days. An empty from means today.
func (c *Client) Schedule(ctx context.Context, from string, days int) ([]Day, error) {
	q := url.Values{}
	if from != "" {
		q.Set("from", from)
	}
	if days > 0 {
		q.Set("days", strconv.Itoa(days))
	}
	var out ScheduleResponse
	if err := get(ctx, c, "/api/schedule?"+q.Encode(), &out); err != nil {
		return nil, err
	}
	return out.Days, nil
}

// Live returns the currently-live scores. Used to patch the schedule in place
// rather than refetching it, which is what keeps the repaint down to a few cells.
func (c *Client) Live(ctx context.Context) ([]LiveMatch, error) {
	var out LiveResponse
	if err := get(ctx, c, "/api/live", &out); err != nil {
		return nil, err
	}
	return out.Matches, nil
}

// Match returns one fixture with its detail, or nil if it does not exist.
func (c *Client) Match(ctx context.Context, id int) (*MatchDetail, error) {
	var out MatchDetailResponse
	if err := get(ctx, c, "/api/match/"+strconv.Itoa(id), &out); err != nil {
		return nil, err
	}
	return out.Match, nil
}

// Competitions returns the tracked competitions.
func (c *Client) Competitions(ctx context.Context) ([]CompetitionInfo, error) {
	var out CompetitionsResponse
	if err := get(ctx, c, "/api/competitions", &out); err != nil {
		return nil, err
	}
	return out.Competitions, nil
}

// Competition returns one competition's tables, bracket and rankings.
func (c *Client) Competition(ctx context.Context, slug string) (*CompetitionDetail, error) {
	var out CompetitionDetailResponse
	if err := get(ctx, c, "/api/competition/"+url.PathEscape(slug), &out); err != nil {
		return nil, err
	}
	return out.Competition, nil
}
