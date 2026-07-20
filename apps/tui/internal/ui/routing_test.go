package ui

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
	"github.com/salty-max/lucarne/apps/tui/internal/i18n"
	"github.com/salty-max/lucarne/apps/tui/internal/teletext"
	"github.com/salty-max/lucarne/apps/tui/internal/theme"
)

// These drive the model the way Bubble Tea does, because the rendering tests
// cannot see wiring faults. The match page sat on "loading" for a whole release
// because the shell answered matchMsg itself and returned, so the page never
// received its own data — every view test still passed, since the renderer was
// fine and simply had nothing to render.

func sized(m Model, w, h int) Model {
	next, _ := m.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return next.(Model)
}

func send(m Model, msg tea.Msg) Model {
	next, _ := m.Update(msg)
	return next.(Model)
}

func view(m Model) string { return plain(m.View()) }

func TestMatchDataReachesItsPage(t *testing.T) {
	d := loadMatch(t)

	m := New(t.Context())
	m.stack = []page{&matchPage{id: d.ID}}
	m = sized(m, 90, 40)

	if !strings.Contains(theme.Upper(view(m)), theme.Upper(i18n.T().Loading)) {
		t.Fatal("the page should start on loading")
	}

	m = send(m, matchMsg{match: d})

	text := theme.Upper(view(m))
	if strings.Contains(text, theme.Upper(i18n.T().Loading)) {
		t.Error("still loading after the match arrived")
	}
	if !strings.Contains(text, theme.Upper(teamName(d.Home))) {
		t.Errorf("the match did not render:\n%s", view(m))
	}
}

// A response for a page the user has already left must not overwrite the one
// they are now on.
func TestStaleMatchResponseIsIgnored(t *testing.T) {
	d := loadMatch(t)

	m := New(t.Context())
	m.stack = []page{&matchPage{id: d.ID + 999}}
	m = sized(m, 90, 40)
	m = send(m, matchMsg{match: d})

	if strings.Contains(theme.Upper(view(m)), theme.Upper(teamName(d.Home))) {
		t.Error("a response for another match was accepted")
	}
}

func TestCompetitionDataReachesItsPage(t *testing.T) {
	m := New(t.Context())
	m.stack = []page{&competitionPage{slug: "ligue-1"}}
	m = sized(m, 90, 40)

	detail := &api.CompetitionDetail{Name: "Ligue 1", Country: "France"}
	m = send(m, competitionMsg{slug: "ligue-1", detail: detail})

	if !strings.Contains(theme.Upper(view(m)), "LIGUE 1") {
		t.Errorf("the competition did not render:\n%s", view(m))
	}

	// And a response for a different competition is ignored.
	m2 := New(t.Context())
	m2.stack = []page{&competitionPage{slug: "ligue-1"}}
	m2 = sized(m2, 90, 40)
	m2 = send(m2, competitionMsg{slug: "premier-league",
		detail: &api.CompetitionDetail{Name: "Premier League"}})
	if strings.Contains(theme.Upper(view(m2)), "PREMIER LEAGUE") {
		t.Error("a response for another competition was accepted")
	}
}

// Opening a fixture must push a page and ask for its detail; without the
// command nothing would ever fetch and the page would load forever.
func TestOpeningAFixturePushesAndFetches(t *testing.T) {
	days := loadDays(t)
	i := busiest(days)
	if len(days[i].Matches) == 0 {
		t.Skip("fixture has no matches")
	}

	m := New(t.Context())
	m.days, m.dayIdx, m.loading = days, i, false
	m = sized(m, 90, 40)

	sel := m.selectableIndexes()
	if len(sel) == 0 {
		t.Fatal("no selectable row on the schedule")
	}
	m.cur = sel[0]

	before := len(m.stack)
	next, cmd := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = next.(Model)

	if len(m.stack) != before+1 {
		t.Errorf("stack is %d deep, want %d", len(m.stack), before+1)
	}
	if _, ok := m.current().(*matchPage); !ok {
		t.Errorf("opened %T, want a match page", m.current())
	}
	if cmd == nil {
		t.Error("no fetch was issued, so the page would load forever")
	}
}

// Backspace returns to the page below, and does nothing at the root rather than
// emptying the stack.
func TestBackPopsAndStopsAtTheRoot(t *testing.T) {
	m := New(t.Context())
	m = sized(m, 90, 40)

	m.push(&matchPage{id: 1})
	if len(m.stack) != 2 {
		t.Fatalf("push left %d pages", len(m.stack))
	}

	next, _ := m.Update(tea.KeyMsg{Type: tea.KeyBackspace})
	m = next.(Model)
	if len(m.stack) != 1 {
		t.Errorf("back left %d pages, want 1", len(m.stack))
	}

	next, _ = m.Update(tea.KeyMsg{Type: tea.KeyBackspace})
	m = next.(Model)
	if len(m.stack) != 1 {
		t.Errorf("back at the root left %d pages, want 1", len(m.stack))
	}
}

// Typing three digits jumps; an unassigned number does nothing, as on a set.
func TestPageNumberEntry(t *testing.T) {
	m := New(t.Context())
	m = sized(m, 90, 40)

	for _, r := range "400" {
		next, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{r}})
		m = next.(Model)
	}
	if got := m.current().Number(); got != teletext.PageCompetitions {
		t.Errorf("typing 400 landed on page %s", got)
	}

	for _, r := range "999" {
		next, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{r}})
		m = next.(Model)
	}
	if got := m.current().Number(); got != teletext.PageCompetitions {
		t.Errorf("an unassigned number moved the page to %s", got)
	}
}
