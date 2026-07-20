package pages

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
	"github.com/salty-max/lucarne/apps/tui/internal/render"
)

// Renders against a real captured API response, so the layout is exercised by
// the team names and broadcaster strings that actually occur rather than by
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

// The page is sized by the caller now, so anything layout-related is checked at
// both ends of the range: the teletext floor and the widescreen cap.
var widths = []int{render.MinCols, 56, render.MaxCols}

func renderDayAt(d *api.Day, scroll, cols int) *render.Screen {
	s := render.NewScreen(cols, 24)
	(&Schedule{Day: d, Scroll: scroll}).Render(s)
	return s
}

func renderDay(d *api.Day, scroll int) *render.Screen {
	return renderDayAt(d, scroll, render.MinCols)
}

// Nothing may exceed the 40-column grid: an over-long broadcaster name that
// wrapped would push the whole page out of alignment.
func TestEveryRowFitsTheGrid(t *testing.T) {
	for _, cols := range widths {
		for _, d := range loadDays(t) {
			day := d
			s := renderDayAt(&day, 0, cols)
			for i, line := range strings.Split(s.Text(), "\n") {
				if w := render.Width(line); w > cols {
					t.Errorf("width %d: day %s row %d is %d columns: %q", cols, day.Key, i, w, line)
				}
			}
		}
	}
}

// The point of widening the page is that names stop being cut. At the cap,
// nothing in a real day's fixtures should need an ellipsis.
func TestWideningRemovesTruncation(t *testing.T) {
	days := loadDays(t)
	narrow, wide := 0, 0
	for _, d := range days {
		day := d
		narrow += strings.Count(renderDayAt(&day, 0, render.MinCols).Text(), "…")
		wide += strings.Count(renderDayAt(&day, 0, render.MaxCols).Text(), "…")
	}
	if narrow == 0 {
		t.Skip("nothing is truncated even at the floor")
	}
	if wide >= narrow {
		t.Errorf("widening did not help: %d ellipses at %d cols, %d at %d",
			narrow, render.MinCols, wide, render.MaxCols)
	}
}

func TestHeaderAlwaysPresent(t *testing.T) {
	days := loadDays(t)
	s := renderDay(&days[0], 0)
	first := strings.Split(s.Text(), "\n")[0]
	if !strings.Contains(first, "LUCARNE") {
		t.Errorf("masthead missing: %q", first)
	}
	if !strings.Contains(first, "100") {
		t.Errorf("page number missing: %q", first)
	}
}

func TestFastTextBarIsOnTheLastRow(t *testing.T) {
	days := loadDays(t)
	s := renderDay(&days[0], 0)
	lines := strings.Split(s.Text(), "\n")
	last := lines[len(lines)-1]
	for _, want := range []string{"PREV", "NEXT", "QUIT"} {
		if !strings.Contains(last, want) {
			t.Errorf("FastText bar missing %q: %q", want, last)
		}
	}
}

func TestFixturesAndBroadcastersAppear(t *testing.T) {
	// Pick the busiest day so the body is definitely populated.
	days := loadDays(t)
	busiest := &days[0]
	for i := range days {
		if len(days[i].Matches) > len(busiest.Matches) {
			busiest = &days[i]
		}
	}
	if len(busiest.Matches) == 0 {
		t.Skip("fixture has no matches on any day")
	}

	text := renderDay(busiest, 0).Text()
	m := busiest.Matches[0]
	name := m.Home.Name
	if m.Home.ShortName != nil && *m.Home.ShortName != "" {
		name = *m.Home.ShortName
	}
	// Truncation is expected on long names, so match on a prefix.
	head := render.Upper(name)
	if len(head) > 6 {
		head = head[:6]
	}
	if !strings.Contains(text, head) {
		t.Errorf("first fixture %q not rendered\n%s", name, text)
	}
	if len(m.Broadcasters) > 0 {
		b := m.Broadcasters[0].Name
		if len(b) > 5 && !strings.Contains(text, b[:5]) {
			t.Errorf("broadcaster %q not rendered\n%s", b, text)
		}
	}
}

func TestScrollClampsAndMoves(t *testing.T) {
	days := loadDays(t)
	busiest := &days[0]
	for i := range days {
		if len(days[i].Matches) > len(busiest.Matches) {
			busiest = &days[i]
		}
	}
	p := &Schedule{Day: busiest}
	if p.MaxScroll() == 0 {
		t.Skip("no day in the fixture overflows a page")
	}

	top := renderDay(busiest, 0).Text()
	bottom := renderDay(busiest, p.MaxScroll()).Text()
	if top == bottom {
		t.Error("scrolling to the end changed nothing")
	}

	// Past the end must clamp, not blank the page or panic.
	beyond := renderDay(busiest, p.MaxScroll()+50).Text()
	if beyond != bottom {
		t.Error("scrolling past the end was not clamped")
	}
}

func TestEmptyDayIsExplained(t *testing.T) {
	s := render.NewScreen(render.MinCols, 24)
	(&Schedule{Day: &api.Day{Key: "2026-01-01", Label: "x"}}).Render(s)
	if !strings.Contains(s.Text(), "NO MATCHES") {
		t.Errorf("empty day not explained:\n%s", s.Text())
	}
}

func TestAPIErrorIsShown(t *testing.T) {
	s := render.NewScreen(render.MinCols, 24)
	(&Schedule{Err: errFake{}}).Render(s)
	text := s.Text()
	if !strings.Contains(text, "NO RESPONSE") {
		t.Errorf("error state not shown:\n%s", text)
	}
	// The bar must survive the error state, or the user cannot quit with C.
	if !strings.Contains(text, "QUIT") {
		t.Error("FastText bar missing in the error state")
	}
}

type errFake struct{}

func (errFake) Error() string { return "connection refused" }
