package ui

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
	"github.com/salty-max/lucarne/apps/tui/internal/theme"
)

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

// minCastW is the narrowest broadcaster column worth having beside the fixture.
// There is deliberately no width threshold constant: an earlier one was a guess,
// and at 64 columns the two capped name fields left a single column for the
// broadcaster, so it silently never inlined. The condition is the space left.
const minCastW = 10

func layout(total int) cols {
	c := cols{total: total, timeW: 5, scoreW: 5, gutter: 1}
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

// fixtureLines renders a day grouped by competition. Each fixture is selectable
// and opens its detail page, which is what the web client's match links do.
func fixtureLines(m *Model, d *api.Day, width int, title, subtitle string) []line {
	out := headerLines(title, subtitle, width)
	c := layout(width)

	switch {
	case m.err != nil:
		return append(out, plainLine(""),
			plainLine(theme.Alert.Render(" NO RESPONSE FROM THE API")),
			plainLine(" "+theme.TeamName.Render(m.err.Error())),
			plainLine(theme.Muted.Render(" CHECK THAT THE API IS RUNNING.")))
	case m.loading:
		return append(out, plainLine(""), plainLine(theme.Muted.Render(" LOADING…")))
	case d == nil || len(d.Matches) == 0:
		return append(out, plainLine(""), plainLine(theme.Muted.Render(" NO MATCHES ON THIS DAY.")))
	}

	var order []string
	groups := map[string][]api.Match{}
	for _, f := range d.Matches {
		k := f.Competition.Name
		if _, seen := groups[k]; !seen {
			order = append(order, k)
		}
		groups[k] = append(groups[k], f)
	}

	for _, name := range order {
		out = append(out, plainLine(""),
			plainLine(theme.SectionLabel(name, competitionColour(name), width)))
		for _, f := range groups[name] {
			fixture := f
			out = append(out, line{
				text: fixtureLine(fixture, c),
				open: func(m *Model) tea.Cmd {
					cmd := m.push(&matchPage{id: fixture.ID})
					return tea.Batch(cmd, m.fetchMatch(fixture.ID))
				},
			})
			if !c.inlineCast {
				if cast := broadcasters(fixture); cast != "" {
					out = append(out, plainLine(strings.Repeat(" ", c.home)+
						theme.Broadcaster.Render(theme.Pad(cast, width-c.home-1))))
				}
			}
		}
	}
	return out
}

func fixtureLine(f api.Match, c cols) string {
	var b strings.Builder
	switch f.Status {
	case api.MatchStatusLive:
		lbl := "LIVE"
		if f.Elapsed != nil {
			lbl = strconv.Itoa(*f.Elapsed) + "'"
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
			b.WriteString("  " + theme.Broadcaster.Render(theme.Pad(cast, c.castW)))
		}
	}
	return b.String()
}

// scoreboard is the match page's headline: both sides and the result, with the
// shootout score when one decided it.
func scoreboard(d api.MatchDetail) string {
	line := theme.TeamName.Render(theme.Upper(teamName(d.Home))) + "  " +
		scoreStyle(d.Match).Render(score(d.Match)) + "  " +
		theme.TeamName.Render(theme.Upper(teamName(d.Away)))
	if d.HomePenalties != nil && d.AwayPenalties != nil {
		line += theme.Muted.Render(fmt.Sprintf("  (PENS %d-%d)", *d.HomePenalties, *d.AwayPenalties))
	}
	return line
}

func standingsHead(width int) string {
	return theme.Muted.Render(" " + theme.Pad("#", 3) + theme.Pad("TEAM", max(width-30, 10)) +
		theme.PadLeft("P", 4) + theme.PadLeft("W", 4) + theme.PadLeft("D", 4) +
		theme.PadLeft("L", 4) + theme.PadLeft("GD", 5) + theme.PadLeft("PTS", 5))
}

func standingsRow(r api.StandingRow, width int) string {
	return " " + theme.Muted.Render(theme.Pad(strconv.Itoa(r.Rank), 3)) +
		theme.TeamName.Render(theme.Pad(theme.Upper(r.Team.Name), max(width-30, 10))) +
		theme.Muted.Render(theme.PadLeft(strconv.Itoa(r.Played), 4)+
			theme.PadLeft(strconv.Itoa(r.Win), 4)+
			theme.PadLeft(strconv.Itoa(r.Draw), 4)+
			theme.PadLeft(strconv.Itoa(r.Lose), 4)+
			theme.PadLeft(strconv.Itoa(r.GoalsDiff), 5)) +
		theme.MastheadName.Render(theme.PadLeft(strconv.Itoa(r.Points), 5))
}

func topPlayerRow(e api.TopPlayerEntry, width int) string {
	return " " + theme.Muted.Render(theme.Pad(strconv.Itoa(e.Rank), 3)) +
		theme.TeamName.Render(theme.Pad(theme.Upper(e.Player), max(width-28, 10))) +
		theme.Muted.Render(theme.Pad(theme.Upper(e.Team), 18)) +
		theme.MastheadName.Render(theme.PadLeft(strconv.Itoa(e.Value), 4))
}

func eventRow(e api.MatchEvent, width int) string {
	minute := "  "
	if e.Minute != nil {
		minute = strconv.Itoa(*e.Minute) + "'"
		if e.ExtraMinute != nil {
			minute = fmt.Sprintf("%d+%d'", *e.Minute, *e.ExtraMinute)
		}
	}
	who := ""
	if e.Player != nil {
		who = theme.Upper(*e.Player)
	}
	kind := e.Type
	if e.Detail != nil && *e.Detail != "" {
		kind = *e.Detail
	}
	side := " "
	if e.Side != nil && *e.Side == "away" {
		side = "»"
	} else if e.Side != nil {
		side = "«"
	}
	return " " + theme.Time.Render(theme.Pad(minute, 7)) +
		theme.Muted.Render(side+" ") +
		theme.TeamName.Render(theme.Pad(who, max(width-30, 10))) +
		theme.Muted.Render(theme.Upper(kind))
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
