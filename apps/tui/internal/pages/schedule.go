// Package pages turns API payloads into teletext pages.
package pages

import (
	"fmt"
	"strings"
	"time"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
	"github.com/salty-max/lucarne/apps/tui/internal/render"
)

// Column budget for a fixture row, on a 40-column page. Fixed offsets rather
// than flowing layout: teletext aligns, and a score that moves left when a team
// name is short reads as a different kind of page.
const (
	colTime  = 0  // 21:00, or 72' once live
	colHome  = 6  // 13 wide
	colScore = 19 // "2 - 1"
	colAway  = 25 // 14 wide
	homeW    = 13
	awayW    = 14
)

// Rows reserved by the chrome: masthead, its trailing blank, and the FastText bar.
const (
	firstRow = 2
	lastRow  = render.Rows - 2
	bodyRows = lastRow - firstRow + 1
)

// A row paints itself at a given y. Building the page as a flat list of these
// makes scrolling a slice of the list rather than a special case in the layout.
type row func(s *render.Screen, y int)

// Schedule is the state page 100 renders from.
type Schedule struct {
	Day    *api.Day
	Offset int // days from today, for the header
	Scroll int
	Err    error
}

// Lines returns how many body rows the current day needs, so the caller can
// clamp scrolling without duplicating the layout rules.
func (p *Schedule) Lines() int { return len(p.rows()) }

// MaxScroll is the furthest useful scroll position.
func (p *Schedule) MaxScroll() int {
	if n := p.Lines() - bodyRows; n > 0 {
		return n
	}
	return 0
}

func (p *Schedule) rows() []row {
	var rows []row
	if p.Day == nil {
		return rows
	}

	// Group by competition, preserving the order the API sent.
	var order []string
	groups := map[string][]api.Match{}
	for _, m := range p.Day.Matches {
		k := m.Competition.Name
		if _, seen := groups[k]; !seen {
			order = append(order, k)
		}
		groups[k] = append(groups[k], m)
	}

	for i, name := range order {
		if i > 0 {
			rows = append(rows, func(*render.Screen, int) {}) // spacer
		}
		comp := name
		colour := competitionColour(comp)
		rows = append(rows, func(s *render.Screen, y int) {
			s.Band(y, colour)
			s.Put(1, y, render.Upper(comp), render.Black, colour)
		})
		for _, m := range groups[name] {
			match := m
			rows = append(rows, func(s *render.Screen, y int) { fixtureRow(s, match, y) })
			if b := broadcasterLabel(match); b != "" {
				rows = append(rows, func(s *render.Screen, y int) {
					s.Put(colHome, y, render.Truncate(b, render.Cols-colHome-1), render.Yellow, render.Black)
				})
			}
		}
	}
	return rows
}

// Render paints the page: masthead, the visible slice of rows, FastText bar.
func (p *Schedule) Render(s *render.Screen) {
	s.Clear(render.White, render.Black)
	p.header(s)

	if p.Err != nil {
		s.Put(1, 4, "NO RESPONSE FROM THE API", render.Red, render.Black)
		s.Put(1, 6, render.Truncate(p.Err.Error(), render.Cols-2), render.White, render.Black)
		s.Put(1, 8, "CHECK THAT THE API IS RUNNING.", render.Cyan, render.Black)
		p.fastText(s)
		return
	}

	rows := p.rows()
	if len(rows) == 0 {
		s.Put(1, 4, "NO MATCHES ON THIS DAY.", render.Cyan, render.Black)
		p.fastText(s)
		return
	}

	scroll := min(max(p.Scroll, 0), p.MaxScroll())
	for i := 0; i < bodyRows; i++ {
		j := scroll + i
		if j >= len(rows) {
			break
		}
		rows[j](s, firstRow+i)
	}

	p.fastText(s)
}

func (p *Schedule) header(s *render.Screen) {
	s.Band(0, render.Blue)
	s.Put(1, 0, "LUCARNE", render.Yellow, render.Blue)
	s.Put(20, 0, "100", render.White, render.Blue)

	label := "TODAY"
	if p.Day != nil {
		if d, err := time.Parse("2006-01-02", p.Day.Key); err == nil {
			label = render.Upper(d.Format("Mon 02 Jan"))
		}
	}
	s.Put(render.Cols-1-render.Width(label), 0, label, render.Cyan, render.Blue)

	// Scroll state lives in the masthead: drawn over the body it would punch a
	// black notch through a coloured competition band.
	if p.MaxScroll() > 0 {
		mark := "▼"
		switch {
		case p.Scroll >= p.MaxScroll():
			mark = "▲"
		case p.Scroll > 0:
			mark = "↕"
		}
		s.Put(17, 0, mark, render.Yellow, render.Blue)
	}
}

func (p *Schedule) fastText(s *render.Screen) {
	keys := []struct {
		label  string
		colour render.Color
	}{
		{"PREV", render.Red},
		{"NEXT", render.Green},
		{"COMPS", render.Yellow},
		{"QUIT", render.Cyan},
	}
	x := 0
	for _, k := range keys {
		s.Put(x, render.Rows-1, "▐", k.colour, render.Black)
		s.Put(x+1, render.Rows-1, k.label, render.Black, k.colour)
		x += render.Width(k.label) + 2
	}
}

func fixtureRow(s *render.Screen, m api.Match, y int) {
	// Left column: kickoff, or the live minute once it is under way.
	switch m.Status {
	case api.MatchStatusLive:
		min := "LIVE"
		if m.Elapsed != nil {
			min = fmt.Sprintf("%d'", *m.Elapsed)
		}
		s.Put(colTime, y, render.PadEnd(min, 5), render.Black, render.Red)
	case api.MatchStatusPostponed:
		s.Put(colTime, y, "RPT  ", render.Black, render.Yellow)
	default:
		s.Put(colTime, y, kickoffLabel(m.Kickoff), render.Cyan, render.Black)
	}

	home, away := render.Upper(teamName(m.Home)), render.Upper(teamName(m.Away))
	s.Put(colHome, y, render.Ellipsis(home, homeW), render.White, render.Black)
	s.Put(colAway, y, render.Ellipsis(away, awayW), render.White, render.Black)
	s.Put(colScore, y, scoreLabel(m), scoreColour(m), render.Black)
}

func teamName(t api.Team) string {
	if t.ShortName != nil && *t.ShortName != "" {
		return *t.ShortName
	}
	return t.Name
}

func kickoffLabel(iso string) string {
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		return "--:--"
	}
	if loc, err := time.LoadLocation("Europe/Paris"); err == nil {
		t = t.In(loc)
	}
	return t.Format("15:04")
}

func scoreLabel(m api.Match) string {
	if m.HomeGoals == nil || m.AwayGoals == nil {
		return "  -  "
	}
	return fmt.Sprintf("%d - %d", *m.HomeGoals, *m.AwayGoals)
}

func scoreColour(m api.Match) render.Color {
	switch m.Status {
	case api.MatchStatusLive:
		return render.Yellow
	case api.MatchStatusFinished:
		return render.White
	default:
		return render.Cyan
	}
}

func broadcasterLabel(m api.Match) string {
	if len(m.Broadcasters) == 0 {
		return ""
	}
	names := make([]string, 0, len(m.Broadcasters))
	for _, b := range m.Broadcasters {
		names = append(names, b.Name)
	}
	return strings.Join(names, " / ")
}

// competitionColour keeps a competition the same colour across repaints, which
// is what lets you find Ligue 1 without reading the band.
func competitionColour(name string) render.Color {
	palette := []render.Color{render.Red, render.Green, render.Yellow, render.Magenta, render.Cyan}
	var sum int
	for _, r := range name {
		sum += int(r)
	}
	return palette[sum%len(palette)]
}
