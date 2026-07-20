package ui

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
	"github.com/salty-max/lucarne/apps/tui/internal/theme"
)

// Rendered against a real captured response, so the layout is exercised by the
// club names and broadcaster strings that actually occur rather than by
// convenient short ones.
func loadDays(t *testing.T) []api.Day {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "api", "testdata", "schedule.json"))
	if err != nil {
		t.Fatalf("fixture: %v", err)
	}
	var res api.ScheduleResponse
	if err := json.NewDecoder(bytes.NewReader(raw)).Decode(&res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(res.Days) == 0 {
		t.Fatal("fixture has no days")
	}
	return res.Days
}

func busiest(days []api.Day) int {
	best := 0
	for i := range days {
		if len(days[i].Matches) > len(days[best].Matches) {
			best = i
		}
	}
	return best
}

func modelAt(days []api.Day, idx, width int) Model {
	return Model{days: days, idx: idx, width: width, height: 30}
}

var ansi = regexp.MustCompile(`\x1b\[[0-9;]*m`)

func plain(s string) string { return ansi.ReplaceAllString(s, "") }

// Widths worth checking: the teletext floor, a middle size, either side of the
// point where the broadcaster gains its own column, and a wide window.
var widths = []int{40, 56, 72, 76, 100}

// No rendered line may exceed the page width. A single over-long broadcaster
// name that wrapped would push everything below it out of alignment.
func TestNoLineOverflows(t *testing.T) {
	days := loadDays(t)
	for _, w := range widths {
		for i := range days {
			m := modelAt(days, i, w)
			for n, line := range strings.Split(plain(m.body()), "\n") {
				if got := theme.Width(line); got > w {
					t.Errorf("width %d, day %s, line %d is %d columns: %q",
						w, days[i].Key, n, got, line)
				}
			}
		}
	}
}

// The whole point of letting the page widen is that names stop being cut.
func TestWideningRemovesTruncation(t *testing.T) {
	days := loadDays(t)
	narrow, wide := 0, 0
	for i := range days {
		narrow += strings.Count(plain(modelAt(days, i, 40).body()), "…")
		wide += strings.Count(plain(modelAt(days, i, 100).body()), "…")
	}
	if narrow == 0 {
		t.Skip("nothing is truncated even at the floor")
	}
	if wide >= narrow {
		t.Errorf("widening did not help: %d ellipses at 40 columns, %d at 100", narrow, wide)
	}
}

// Once there is room, the broadcaster shares the fixture row instead of taking
// one of its own, which halves the rows a busy day needs.
func TestBroadcasterMovesInline(t *testing.T) {
	days := loadDays(t)
	i := busiest(days)
	if len(days[i].Matches) == 0 {
		t.Skip("fixture has no matches")
	}
	// Find the width at which inlining actually engages, rather than assuming
	// one: the layout decides from the space left after the name columns.
	threshold := 0
	for w := 40; w <= 120; w++ {
		if layout(w).inlineCast {
			threshold = w
			break
		}
	}
	if threshold == 0 {
		t.Fatal("the broadcaster never inlines at any width up to 120")
	}
	t.Logf("broadcaster gains its own column at %d columns", threshold)

	narrow := len(strings.Split(plain(modelAt(days, i, threshold-1).body()), "\n"))
	wide := len(strings.Split(plain(modelAt(days, i, threshold).body()), "\n"))
	if wide >= narrow {
		t.Errorf("inlining did not reduce the rows: %d at %d columns, %d at %d",
			narrow, threshold-1, wide, threshold)
	}
}

func TestFixtureShowsTimeTeamsAndBroadcaster(t *testing.T) {
	days := loadDays(t)
	i := busiest(days)
	if len(days[i].Matches) == 0 {
		t.Skip("fixture has no matches")
	}
	text := plain(modelAt(days, i, 100).body())
	f := days[i].Matches[0]

	name := f.Home.Name
	if f.Home.ShortName != nil && *f.Home.ShortName != "" {
		name = *f.Home.ShortName
	}
	if !strings.Contains(text, theme.Upper(name)) {
		t.Errorf("home team %q missing from the page", name)
	}
	if !strings.Contains(text, f.Competition.Name) &&
		!strings.Contains(text, theme.Upper(f.Competition.Name)) {
		t.Errorf("competition band %q missing", f.Competition.Name)
	}
	if len(f.Broadcasters) > 0 && !strings.Contains(text, f.Broadcasters[0].Name) {
		t.Errorf("broadcaster %q missing", f.Broadcasters[0].Name)
	}
}

func TestLiveMatchShowsMinuteAndScore(t *testing.T) {
	min := 72
	h, a := 2, 1
	day := api.Day{Key: "2026-07-23", Label: "x", Matches: []api.Match{{
		ID: 1, Kickoff: "2026-07-23T19:00:00.000Z",
		Status: api.MatchStatusLive, Elapsed: &min,
		HomeGoals: &h, AwayGoals: &a,
		Home: api.Team{Name: "PSG"}, Away: api.Team{Name: "MARSEILLE"},
	}}}
	day.Matches[0].Competition.Name = "Ligue 1"

	text := plain(modelAt([]api.Day{day}, 0, 80).body())
	for _, want := range []string{"72'", "2 - 1", "PSG", "MARSEILLE"} {
		if !strings.Contains(text, want) {
			t.Errorf("live fixture missing %q:\n%s", want, text)
		}
	}
}

func TestEmptyDayAndErrorAreExplained(t *testing.T) {
	empty := modelAt([]api.Day{{Key: "2026-01-01", Label: "x"}}, 0, 40)
	if !strings.Contains(plain(empty.body()), "NO MATCHES") {
		t.Error("an empty day is not explained")
	}

	failed := Model{width: 40, height: 30, err: errFake{}}
	body := plain(failed.body())
	if !strings.Contains(body, "NO RESPONSE") {
		t.Errorf("the error state is not shown:\n%s", body)
	}
	if !strings.Contains(body, "connection refused") {
		t.Error("the underlying error is swallowed")
	}
}

// The key bar has to survive every state, or there is no visible way to quit.
func TestKeyBarAlwaysPresent(t *testing.T) {
	days := loadDays(t)
	for _, m := range []Model{
		modelAt(days, 0, 40),
		{width: 40, height: 30, err: errFake{}},
		{width: 40, height: 30, loading: true},
	} {
		bar := plain(m.keyBar())
		for _, want := range []string{"PREV", "NEXT", "QUIT"} {
			if !strings.Contains(bar, want) {
				t.Errorf("key bar missing %q: %q", want, bar)
			}
		}
	}
}

func TestMastheadFillsTheWidth(t *testing.T) {
	days := loadDays(t)
	for _, w := range widths {
		got := theme.Width(plain(modelAt(days, 0, w).masthead()))
		if got != w {
			t.Errorf("masthead is %d columns, want %d", got, w)
		}
	}
}

func TestLayoutColumnsStayInsideThePage(t *testing.T) {
	for _, w := range widths {
		c := layout(w)
		if end := c.away + c.awayW; end > w {
			t.Errorf("width %d: away column ends at %d", w, end)
		}
		if c.inlineCast && c.cast+c.castW > w {
			t.Errorf("width %d: broadcaster column ends at %d", w, c.cast+c.castW)
		}
	}
}

type errFake struct{}

func (errFake) Error() string { return "connection refused" }
