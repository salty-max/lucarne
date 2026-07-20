package ui

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
	"github.com/salty-max/lucarne/apps/tui/internal/theme"
)

// chromeRows is what the masthead and key bar take, leaving the rest to the
// viewport.
const chromeRows = 2

// Fixed columns, derived from the page width. Teletext aligns: a score that
// drifts left when a club name happens to be short reads as two unrelated
// columns rather than as one fixture.
type cols struct {
	total                 int
	time, home            int
	score, away           int
	homeW, awayW          int
	cast, castW           int
	inlineCast            bool
	timeW, scoreW, gutter int
}

// nameCap is one past the longest club name in the tracked competitions. More
// width beyond it only pushes the score away from the name it belongs to.
const nameCap = 24

// minCastW is the narrowest broadcaster column worth having beside the fixture;
// below it the name would be an ellipsis and a letter.
//
// There is deliberately no width threshold constant here: the earlier one was a
// guess, and at 64 columns the two capped name fields left a single column for
// the broadcaster, so it silently never inlined. The condition is the space
// that is actually left over.
const minCastW = 10

func layout(total int) cols {
	c := cols{total: total, timeW: 5, scoreW: 5, gutter: 1}
	c.time = 0
	c.home = c.timeW + c.gutter
	chrome := c.home + c.scoreW + c.gutter
	c.homeW = min(max(total-chrome, 8)/2, nameCap)
	c.score = c.home + c.homeW
	c.away = c.score + c.scoreW + c.gutter
	c.awayW = min(max(total-c.away, 4), nameCap)

	c.cast = c.away + c.awayW + 2
	c.castW = total - c.cast - 1
	c.inlineCast = c.castW >= minCastW
	return c
}

func (m Model) masthead() string {
	c := layout(m.width)
	label := "TODAY"
	if d := m.day(); d != nil {
		if t, err := time.Parse("2006-01-02", d.Key); err == nil {
			label = theme.Upper(t.Format("Mon 02 Jan"))
		}
	}

	name := theme.MastheadName.Render("LUCARNE")
	page := theme.Masthead.Render("100")
	date := theme.MastheadDim.Render(label)

	// Fill the row so the band spans the page rather than stopping at the text.
	used := theme.Width("LUCARNE") + theme.Width("100") + theme.Width(label) + 2
	gap := max(c.total-used, 1)
	left := gap / 2
	return theme.Masthead.Render(" ") + name +
		theme.Masthead.Render(strings.Repeat(" ", left)) + page +
		theme.Masthead.Render(strings.Repeat(" ", gap-left)) + date +
		theme.Masthead.Render(" ")
}

func (m Model) keyBar() string {
	keys := []struct {
		label string
		c     lipgloss.Color
	}{
		{"prev", theme.Red},
		{"next", theme.Green},
		{"comps", theme.Yellow},
		{"quit", theme.Cyan},
	}
	var b strings.Builder
	for _, k := range keys {
		b.WriteString(theme.FastTextKey(k.label, k.c))
		b.WriteString(" ")
	}
	return b.String()
}

// body renders everything between the masthead and the key bar. The viewport
// scrolls it, so it is built at full length rather than clipped here.
func (m Model) body() string {
	c := layout(m.width)

	switch {
	case m.err != nil:
		return "\n" + theme.Alert.Render(" NO RESPONSE FROM THE API") + "\n\n" +
			theme.TeamName.Render(" "+m.err.Error()) + "\n\n" +
			theme.Muted.Render(" CHECK THAT THE API IS RUNNING.")
	case m.loading:
		return "\n" + theme.Muted.Render(" LOADING…")
	}

	d := m.day()
	if d == nil || len(d.Matches) == 0 {
		return "\n" + theme.Muted.Render(" NO MATCHES ON THIS DAY.")
	}

	// Group by competition, preserving the order the API sent.
	var order []string
	groups := map[string][]api.Match{}
	for _, f := range d.Matches {
		k := f.Competition.Name
		if _, seen := groups[k]; !seen {
			order = append(order, k)
		}
		groups[k] = append(groups[k], f)
	}

	var b strings.Builder
	for i, name := range order {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString(theme.Band(name, competitionColour(name), c.total))
		b.WriteString("\n")
		for _, f := range groups[name] {
			b.WriteString(fixtureLine(f, c))
			b.WriteString("\n")
			if !c.inlineCast {
				if cast := broadcasters(f); cast != "" {
					b.WriteString(strings.Repeat(" ", c.home))
					b.WriteString(theme.Broadcaster.Render(theme.Pad(cast, c.total-c.home-1)))
					b.WriteString("\n")
				}
			}
		}
	}
	return b.String()
}

func fixtureLine(f api.Match, c cols) string {
	var b strings.Builder

	switch f.Status {
	case api.MatchStatusLive:
		lbl := "LIVE"
		if f.Elapsed != nil {
			lbl = fmt.Sprintf("%d'", *f.Elapsed)
		}
		b.WriteString(theme.LiveTag.Render(theme.Pad(lbl, c.timeW)))
	case api.MatchStatusPostponed:
		b.WriteString(theme.PostponedTag.Render(theme.Pad("PPD", c.timeW)))
	default:
		b.WriteString(theme.Time.Render(theme.Pad(kickoff(f.Kickoff), c.timeW)))
	}
	b.WriteString(strings.Repeat(" ", c.gutter))

	b.WriteString(theme.TeamName.Render(theme.Pad(theme.Upper(teamName(f.Home)), c.homeW)))
	b.WriteString(scoreStyle(f).Render(theme.Pad(score(f), c.scoreW)))
	b.WriteString(strings.Repeat(" ", c.gutter))
	b.WriteString(theme.TeamName.Render(theme.Pad(theme.Upper(teamName(f.Away)), c.awayW)))

	if c.inlineCast {
		if cast := broadcasters(f); cast != "" {
			b.WriteString("  ")
			b.WriteString(theme.Broadcaster.Render(theme.Pad(cast, c.castW)))
		}
	}
	return b.String()
}

func teamName(t api.Team) string {
	if t.ShortName != nil && *t.ShortName != "" {
		return *t.ShortName
	}
	return t.Name
}

func kickoff(iso string) string {
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		return "--:--"
	}
	if loc, err := time.LoadLocation("Europe/Paris"); err == nil {
		t = t.In(loc)
	}
	return t.Format("15:04")
}

func score(f api.Match) string {
	if f.HomeGoals == nil || f.AwayGoals == nil {
		return "  -  "
	}
	return fmt.Sprintf("%d - %d", *f.HomeGoals, *f.AwayGoals)
}

func scoreStyle(f api.Match) lipgloss.Style {
	switch f.Status {
	case api.MatchStatusLive:
		return theme.ScoreLive
	case api.MatchStatusFinished:
		return theme.Score
	default:
		return theme.ScorePending
	}
}

func broadcasters(f api.Match) string {
	if len(f.Broadcasters) == 0 {
		return ""
	}
	names := make([]string, 0, len(f.Broadcasters))
	for _, b := range f.Broadcasters {
		names = append(names, b.Name)
	}
	return strings.Join(names, " / ")
}

// competitionColour keeps a competition the same colour across repaints, which
// is what lets you find Ligue 1 without reading the band.
func competitionColour(name string) lipgloss.Color {
	palette := []lipgloss.Color{theme.Red, theme.Green, theme.Yellow, theme.Magenta, theme.Cyan}
	var sum int
	for _, r := range name {
		sum += int(r)
	}
	return palette[sum%len(palette)]
}
