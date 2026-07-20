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
	"github.com/salty-max/lucarne/apps/tui/internal/teletext"
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

// modelAt builds a model showing one day at a given width, without a terminal.
func modelAt(days []api.Day, idx, width int) Model {
	m := Model{days: days, dayIdx: idx, width: width, height: 30}
	m.stack = []page{&todayPage{}}
	return m
}

// bodyOf renders the current page's lines as plain text, which is what the
// viewport would scroll.
func bodyOf(m Model) string {
	var rows []string
	for _, l := range m.current().Lines(&m, m.width) {
		rows = append(rows, l.text)
	}
	return strings.Join(rows, "\n")
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
			for n, line := range strings.Split(plain(bodyOf(m)), "\n") {
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
		narrow += strings.Count(plain(bodyOf(modelAt(days, i, 40))), "…")
		wide += strings.Count(plain(bodyOf(modelAt(days, i, 100))), "…")
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

	narrow := len(strings.Split(plain(bodyOf(modelAt(days, i, threshold-1))), "\n"))
	wide := len(strings.Split(plain(bodyOf(modelAt(days, i, threshold))), "\n"))
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
	text := plain(bodyOf(modelAt(days, i, 100)))
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

	text := plain(bodyOf(modelAt([]api.Day{day}, 0, 80)))
	for _, want := range []string{"72'", "2 - 1", "PSG", "MARSEILLE"} {
		if !strings.Contains(text, want) {
			t.Errorf("live fixture missing %q:\n%s", want, text)
		}
	}
}

func TestEmptyDayAndErrorAreExplained(t *testing.T) {
	empty := modelAt([]api.Day{{Key: "2026-01-01", Label: "x"}}, 0, 40)
	if !strings.Contains(plain(bodyOf(empty)), "NO MATCHES") {
		t.Error("an empty day is not explained")
	}

	failed := modelAt(nil, 0, 40)
	failed.err = errFake{}
	body := plain(bodyOf(failed))
	if !strings.Contains(body, "NO RESPONSE") {
		t.Errorf("the error state is not shown:\n%s", body)
	}
	if !strings.Contains(body, "connection refused") {
		t.Error("the underlying error is swallowed")
	}
}

// The key bar has to survive every state, or there is no visible way to quit.
// Narrow pages drop the page numbers rather than the words, as the web client
// does below its sm breakpoint.
func TestFastTextDropsNumbersWhenNarrow(t *testing.T) {
	wide := plain(fastRow(teletext.FastText, 100))
	if !strings.Contains(wide, "100") || !strings.Contains(wide, "600") {
		t.Errorf("wide bar lost its page numbers: %q", wide)
	}
	narrow := plain(fastRow(teletext.FastText, 40))
	if strings.Contains(narrow, "100") {
		t.Errorf("narrow bar kept the numbers at the cost of the labels: %q", narrow)
	}
	for _, want := range []string{"LIVE", "CALEND", "BROAD"} {
		if !strings.Contains(narrow, want) {
			t.Errorf("narrow bar lost %q: %q", want, narrow)
		}
	}
}

func TestKeyBarAlwaysPresent(t *testing.T) {
	days := loadDays(t)
	loadingM := modelAt(days, 0, 40)
	loadingM.loading = true
	errM := modelAt(days, 0, 40)
	errM.err = errFake{}
	// The bar is chrome, so it must not depend on the page's state at all.
	for _, m := range []Model{modelAt(days, 0, 100), errM, loadingM} {
		_ = m.current() // the state differs; the bar must not
		bar := plain(fastRow(teletext.FastText, 100))
		for _, want := range []string{"LIVE", "CALENDAR", "BROADCASTERS"} {
			if !strings.Contains(bar, want) {
				t.Errorf("FastText bar missing %q: %q", want, bar)
			}
		}
	}
}

func TestServiceLineFillsTheWidth(t *testing.T) {
	days := loadDays(t)
	for _, w := range widths {
		m := modelAt(days, 0, w)
		got := theme.Width(plain(m.serviceLine(w)))
		if got != w {
			t.Errorf("service line is %d columns, want %d", got, w)
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
