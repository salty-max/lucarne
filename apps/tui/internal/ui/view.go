package ui

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
	"github.com/salty-max/lucarne/apps/tui/internal/i18n"
	"github.com/salty-max/lucarne/apps/tui/internal/theme"
)

// fixtureLines renders a day the way the web client does: a coloured bar
// carrying the day and its match count, then one row per fixture with the
// broadcaster set right as a solid tag, joined by a dotted leader.
func fixtureLines(m *Model, d *api.Day, width int, title, subtitle string) []line {
	t := i18n.T()
	out := headerLines(title, subtitle, width)

	switch {
	case m.err != nil:
		return append(out, plainLine(""),
			plainLine(theme.Alert.Render(" "+theme.Upper(t.NoResponse))),
			plainLine(" "+theme.TeamName.Render(m.err.Error())),
			plainLine(theme.Muted.Render(" "+theme.Upper(t.CheckAPI))))
	case m.loading:
		return append(out, plainLine(""), plainLine(theme.Muted.Render(" "+theme.Upper(t.Loading))))
	case d == nil || len(d.Matches) == 0:
		return append(out, plainLine(""), plainLine(theme.Muted.Render(" "+theme.Upper(t.NoMatches))))
	}

	// Day bar: label left, count right, as .tt-bar with .tt-bar-r.
	count := strconv.Itoa(len(d.Matches))
	label := theme.Upper(i18n.DayLabel(d.Key))
	pad := max(width-theme.Width(label)-theme.Width(count)-2, 1)
	out = append(out,
		sectionLine(theme.BarRow(" "+label+strings.Repeat(" ", pad)+count+" ", theme.Yellow)))

	for _, g := range groupByCompetition(d.Matches) {
		out = append(out, plainLine(""), sectionLine(competitionBar(g, width)))
		for _, f := range g.matches {
			fixture := f
			hoisted := g.sharedCast != ""
			out = append(out, line{
				text: fixtureLine(fixture, width, hoisted),
				open: func(m *Model) tea.Cmd {
					cmd := m.push(&matchPage{id: fixture.ID})
					return tea.Batch(cmd, m.fetchMatch(fixture.ID))
				},
			})
		}
	}
	return out
}

// group is one competition's fixtures within a day.
type group struct {
	name    string
	matches []api.Match
	// sharedCast is the broadcaster line when every fixture in the group has
	// the same one, and empty otherwise. Rights are split within a competition
	// often enough that hoisting a partial one would state something false —
	// and where to watch is the whole point of the page.
	sharedCast string
}

func groupByCompetition(matches []api.Match) []group {
	var order []string
	byName := map[string][]api.Match{}
	for _, f := range matches {
		n := f.Competition.Name
		if _, seen := byName[n]; !seen {
			order = append(order, n)
		}
		byName[n] = append(byName[n], f)
	}

	out := make([]group, 0, len(order))
	for _, n := range order {
		g := group{name: n, matches: byName[n]}
		first := broadcasters(g.matches[0])
		same := first != ""
		for _, f := range g.matches[1:] {
			if broadcasters(f) != first {
				same = false
				break
			}
		}
		if same {
			g.sharedCast = first
		}
		out = append(out, g)
	}
	return out
}

// competitionBar is the section header: the competition left, and its
// broadcaster right when the whole group shares one.
func competitionBar(g group, width int) string {
	name := theme.Upper(i18n.Competition(g.name))
	if g.sharedCast == "" {
		return theme.Band(name, competitionColour(g.name), width)
	}
	cast := theme.Upper(g.sharedCast)
	pad := max(width-theme.Width(name)-theme.Width(cast)-2, 1)
	return theme.BarRow(" "+name+strings.Repeat(" ", pad)+cast+" ", competitionColour(g.name))
}

// fixtureLine is one row: surveillance box, kickoff, the tie, then the
// broadcaster set flush right.
//
// The dots run from the tie to the tag, which is what makes the pairing legible
// across a wide page. Vertical separation comes from a blank line rather than a
// second run of dots — two dotted things a row apart read as noise.
//
// Status is carried by a glyph as well as by colour — a live match reads as
// live under NO_COLOR, in a monochrome capture, and for anyone who cannot rely
// on a red/green distinction.
func fixtureLine(f api.Match, width int, castHoisted bool) string {
	var b strings.Builder

	b.WriteString(theme.Muted.Render("  ▢  "))

	switch f.Status {
	case api.MatchStatusLive:
		lbl := "●LIVE"
		if f.Elapsed != nil {
			lbl = "●" + strconv.Itoa(*f.Elapsed) + "'"
		}
		b.WriteString(theme.LiveTag.Render(theme.Pad(lbl, 6)))
	case api.MatchStatusPostponed:
		b.WriteString(theme.PostponedTag.Render(theme.Pad("✕ RPT", 6)))
	default:
		b.WriteString(theme.Time.Render(theme.Pad(kickoff(f.Kickoff), 6)))
	}
	b.WriteString("   ")

	tie := theme.Upper(teamName(f.Home)) + " – " + theme.Upper(teamName(f.Away))
	if sc := strings.TrimSpace(score(f)); sc != "-" {
		tie = theme.Upper(teamName(f.Home)) + "  " + sc + "  " + theme.Upper(teamName(f.Away))
	}

	cast := broadcasters(f)
	if castHoisted {
		cast = "" // already stated on the competition bar
	}
	castW := 0
	if cast != "" {
		castW = min(theme.Width(cast)+2, max(width/3, 8))
	}

	room := width - 14 - castW - 2
	tie = theme.Truncate(tie, room)
	lead := max(room-theme.Width(tie)-2, 0)

	b.WriteString(theme.TeamName.Render(tie))
	// The leader only exists to carry the eye to the tag. With the broadcaster
	// stated on the competition bar there is nothing to lead to, and a run of
	// dots ending in blank space reads as a missing value.
	if cast != "" {
		b.WriteString(theme.Rule.Render(" " + strings.Repeat("·", lead) + " "))
		b.WriteString(theme.Tag(theme.Truncate(cast, castW-2), theme.Green))
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
		theme.Strong.Render(theme.PadLeft(strconv.Itoa(r.Points), 5))
}

func topPlayerRow(e api.TopPlayerEntry, width int) string {
	return " " + theme.Muted.Render(theme.Pad(strconv.Itoa(e.Rank), 3)) +
		theme.TeamName.Render(theme.Pad(theme.Upper(e.Player), max(width-28, 10))) +
		theme.Muted.Render(theme.Pad(theme.Upper(e.Team), 18)) +
		theme.Strong.Render(theme.PadLeft(strconv.Itoa(e.Value), 4))
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

// teamName prefers the short name the API supplies, then translates: the tables
// are keyed on full national-team names, so the lookup runs on both forms.
func teamName(t api.Team) string {
	if t.ShortName != nil && *t.ShortName != "" {
		if fr := i18n.Team(*t.ShortName); fr != *t.ShortName {
			return fr
		}
		if fr := i18n.Team(t.Name); fr != t.Name {
			return fr
		}
		return *t.ShortName
	}
	return i18n.Team(t.Name)
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
