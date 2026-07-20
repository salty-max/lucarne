package ui

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
	"github.com/salty-max/lucarne/apps/tui/internal/i18n"
	"github.com/salty-max/lucarne/apps/tui/internal/theme"
)

// The match page, laid out as the web client's MatchDetail: a breadcrumb, the
// competition on a magenta bar with the round set right, the scoreboard, then
// cyan-barred sections for whatever the fixture actually has.

func matchLines(d *api.MatchDetail, width int) []line {
	t := i18n.T()
	var out []line

	// Breadcrumb, then the competition bar carrying the round.
	out = append(out, plainLine(""),
		plainLine(theme.Muted.Render(" ‹ "+theme.Upper(i18n.Competition(d.Competition.Name)))))
	round := ""
	if d.Round != nil {
		round = theme.Upper(i18n.Round(*d.Round))
	}
	out = append(out, plainLine(barWithRight(
		theme.Upper(i18n.Competition(d.Competition.Name)), round, theme.Magenta, width)))

	out = append(out, scoreboardLines(d, width)...)

	if d.Predictions != nil {
		out = append(out, section(t.Prediction, width)...)
		out = append(out, predictionLines(*d.Predictions, width)...)
	}

	goals, cards, subs := splitEvents(d.Events)

	if len(goals) > 0 {
		out = append(out, section(t.Scorers, width)...)
		for _, e := range goals {
			out = append(out, plainLine(goalRow(e, width)))
		}
	}
	if len(cards) > 0 {
		out = append(out, section(t.Cards, width)...)
		for _, e := range cards {
			out = append(out, plainLine(cardRow(e, width)))
		}
	}
	if len(subs) > 0 {
		out = append(out, section(t.Substitutions, width)...)
		for _, e := range subs {
			out = append(out, plainLine(subRow(e, width)))
		}
	}

	if d.Statistics != nil {
		out = append(out, section(t.Statistics, width)...)
		out = append(out, statLines(*d.Statistics, width)...)
	}

	if d.Motm != nil {
		out = append(out, section(t.Motm, width)...)
		out = append(out, plainLine(theme.Truncate(
			" "+theme.MastheadName.Render(theme.Upper(d.Motm.Name))+
				theme.Muted.Render(fmt.Sprintf("   %.1f", d.Motm.Rating)), width)))
	}

	if d.Lineups != nil {
		out = append(out, section(t.Lineups, width)...)
		out = append(out, lineupLines(d, width)...)
	}

	// Detail pages are long; a blank tail keeps the last row clear of the footer.
	return append(out, plainLine(""))
}

// section is a cyan bar with a blank line above it, the rhythm the web client
// gets from its section margins.
func section(label string, width int) []line {
	return []line{plainLine(""), plainLine(theme.SectionLabel(label, theme.Cyan, width))}
}

// barWithRight is .tt-bar with a .tt-bar-r element pushed to the far end.
func barWithRight(left, right string, c lipgloss.Color, width int) string {
	if right == "" {
		return theme.Band(left, c, width)
	}
	pad := max(width-theme.Width(left)-theme.Width(right)-2, 1)
	return theme.BarRow(" "+left+strings.Repeat(" ", pad)+right+" ", c)
}

// scoreboardLines sets each side on its own row with the score set right, which
// is how the web client stacks them.
func scoreboardLines(d *api.MatchDetail, width int) []line {
	home, away := theme.Upper(teamName(d.Home)), theme.Upper(teamName(d.Away))
	hg, ag := "-", "-"
	if d.HomeGoals != nil && d.AwayGoals != nil {
		hg, ag = strconv.Itoa(*d.HomeGoals), strconv.Itoa(*d.AwayGoals)
	}

	// The winner is emphasised, but the score is always there — colour alone
	// must not be what tells you who won.
	hs, as := theme.TeamName, theme.TeamName
	if d.HomeGoals != nil && d.AwayGoals != nil {
		switch {
		case *d.HomeGoals > *d.AwayGoals:
			hs = theme.MastheadName
		case *d.AwayGoals > *d.HomeGoals:
			as = theme.MastheadName
		}
	}

	row := func(name string, st lipgloss.Style, goals string) string {
		pad := max(width-theme.Width(name)-theme.Width(goals)-4, 1)
		return "  " + st.Render(name) + strings.Repeat(" ", pad) +
			theme.ScoreLive.Render(goals) + "  "
	}

	out := []line{
		plainLine(""),
		plainLine(row(home, hs, hg)),
		plainLine(row(away, as, ag)),
	}

	var note []string
	if d.HomePenalties != nil && d.AwayPenalties != nil {
		note = append(note, fmt.Sprintf("%s %d-%d",
			theme.Upper(i18n.T().AfterPens), *d.HomePenalties, *d.AwayPenalties))
	}
	if d.Elapsed != nil && *d.Elapsed > 90 {
		note = append(note, fmt.Sprintf("%s · %d'", theme.Upper(i18n.T().AfterExtraTime), *d.Elapsed))
	}
	if d.Venue != nil && *d.Venue != "" {
		note = append(note, theme.Upper(*d.Venue))
	}
	if len(note) > 0 {
		out = append(out, plainLine("  "+theme.Muted.Render(
			theme.Truncate(strings.Join(note, "  ·  "), width-3))))
	}
	if d.Referee != nil && *d.Referee != "" {
		out = append(out, plainLine("  "+theme.Muted.Render(theme.Truncate(
			theme.Upper(i18n.T().Referee)+" "+theme.Upper(*d.Referee), width-3))))
	}
	return out
}

// predictionLines draw the three-way probability as one bar, with the figures
// spelled out beside it — a bar alone cannot be read precisely, and cannot be
// read at all without colour.
func predictionLines(p api.MatchPrediction, width int) []line {
	span := max(width-4, 10)
	total := max(p.Home+p.Draw+p.Away, 1)
	h := p.Home * span / total
	a := p.Away * span / total
	dr := max(span-h-a, 0)

	bar := lipgloss.NewStyle().Foreground(theme.Blue).Render(strings.Repeat("█", h)) +
		lipgloss.NewStyle().Foreground(theme.White).Render(strings.Repeat("█", dr)) +
		lipgloss.NewStyle().Foreground(theme.Red).Render(strings.Repeat("█", a))

	legend := fmt.Sprintf("%d%%  %s %d%%  %d%%", p.Home, theme.Upper(i18n.T().Draw), p.Draw, p.Away)
	out := []line{
		plainLine("  " + bar),
		plainLine("  " + theme.Muted.Render(theme.Truncate(legend, width-3))),
	}
	if p.Advice != nil && *p.Advice != "" {
		out = append(out, plainLine("  "+theme.Muted.Render(
			theme.Truncate(theme.Upper(*p.Advice), width-3))))
	}
	return out
}

func splitEvents(events []api.MatchEvent) (goals, cards, subs []api.MatchEvent) {
	for _, e := range events {
		switch strings.ToLower(e.Type) {
		case "goal":
			goals = append(goals, e)
		case "card":
			cards = append(cards, e)
		case "subst":
			subs = append(subs, e)
		}
	}
	return
}

func minuteOf(e api.MatchEvent) string {
	if e.Minute == nil {
		return ""
	}
	if e.ExtraMinute != nil && *e.ExtraMinute > 0 {
		return fmt.Sprintf("%d+%d'", *e.Minute, *e.ExtraMinute)
	}
	return strconv.Itoa(*e.Minute) + "'"
}

func goalRow(e api.MatchEvent, width int) string {
	who := ""
	if e.Player != nil {
		who = *e.Player
	}
	row := "  " + theme.Time.Render(theme.Pad(minuteOf(e), 7)) +
		theme.Muted.Render("⚽ ") + theme.ScoreLive.Render(theme.Upper(who))
	if e.Assist != nil && *e.Assist != "" {
		row += theme.Muted.Render(" (" + theme.Upper(*e.Assist) + ")")
	}
	if e.Detail != nil && (strings.Contains(*e.Detail, "Penalty") || strings.Contains(*e.Detail, "Own")) {
		row += theme.Muted.Render(" · " + theme.Upper(*e.Detail))
	}
	return theme.Truncate(row, width)
}

// cardRow is set right, as the web client does — cards read as a column of
// minutes down the right edge rather than as prose.
func cardRow(e api.MatchEvent, width int) string {
	who := ""
	if e.Player != nil {
		who = theme.Upper(*e.Player)
	}
	mark, col := "▮", theme.Yellow
	if e.Detail != nil && strings.Contains(strings.ToLower(*e.Detail), "red") {
		mark, col = "▮", theme.Red
	}
	right := lipgloss.NewStyle().Foreground(col).Render(mark) + " " +
		theme.Time.Render(theme.Pad(minuteOf(e), 6))
	who = theme.Truncate(who, max(width-12, 4))
	pad := max(width-theme.Width(who)-10, 1)
	return strings.Repeat(" ", pad) + theme.TeamName.Render(who) + " " + right
}

func subRow(e api.MatchEvent, width int) string {
	in, out := "", ""
	if e.Player != nil {
		in = theme.Upper(*e.Player)
	}
	if e.Assist != nil {
		out = theme.Upper(*e.Assist)
	}
	// Arrows as well as colour: which player came on must survive NO_COLOR.
	row := "  " + theme.Time.Render(theme.Pad(minuteOf(e), 7)) +
		lipgloss.NewStyle().Foreground(theme.Green).Render("▲ ") + theme.TeamName.Render(in)
	if out != "" {
		row += theme.Muted.Render("  ·  ") +
			lipgloss.NewStyle().Foreground(theme.Red).Render("▼ ") + theme.Muted.Render(out)
	}
	return theme.Truncate(row, width)
}

// statLines draw each statistic as one bar split between the sides, with both
// figures printed. Only fields the API actually filled are shown.
func statLines(s api.MatchStatistics, width int) []line {
	t := i18n.T()
	rows := []struct {
		label string
		h, a  *int
		unit  string
	}{
		{t.Possession, s.Home.Possession, s.Away.Possession, "%"},
		{t.Shots, s.Home.Shots, s.Away.Shots, ""},
		{t.OnTarget, s.Home.ShotsOnTarget, s.Away.ShotsOnTarget, ""},
		{t.Corners, s.Home.Corners, s.Away.Corners, ""},
		{t.Fouls, s.Home.Fouls, s.Away.Fouls, ""},
		{t.Offsides, s.Home.Offsides, s.Away.Offsides, ""},
		{t.Saves, s.Home.Saves, s.Away.Saves, ""},
		{t.PassAccuracy, s.Home.PassAccuracy, s.Away.PassAccuracy, "%"},
		{t.YellowCards, s.Home.YellowCards, s.Away.YellowCards, ""},
		{t.RedCards, s.Home.RedCards, s.Away.RedCards, ""},
	}

	var out []line
	for _, r := range rows {
		if r.h == nil && r.a == nil {
			continue
		}
		out = append(out, plainLine(statRow(r.label, r.h, r.a, r.unit, width)))
	}
	if s.Home.XG != nil || s.Away.XG != nil {
		out = append(out, plainLine(floatStatRow(t.XG, s.Home.XG, s.Away.XG, width)))
	}
	return out
}

func statRow(label string, h, a *int, unit string, width int) string {
	hv, av := 0, 0
	if h != nil {
		hv = *h
	}
	if a != nil {
		av = *a
	}
	span := max(width-34, 6)
	left := hv * span / max(hv+av, 1)

	return "  " + theme.Muted.Render(theme.PadLeft(strconv.Itoa(hv)+unit, 5)) + " " +
		lipgloss.NewStyle().Foreground(theme.Cyan).Render(strings.Repeat("█", left)) +
		lipgloss.NewStyle().Foreground(theme.Magenta).Render(strings.Repeat("█", span-left)) +
		" " + theme.Muted.Render(theme.Pad(strconv.Itoa(av)+unit, 5)) +
		theme.TeamName.Render(theme.Upper(label))
}

func floatStatRow(label string, h, a *float64, width int) string {
	hv, av := 0.0, 0.0
	if h != nil {
		hv = *h
	}
	if a != nil {
		av = *a
	}
	span := max(width-34, 6)
	left := span / 2
	if hv+av > 0 {
		left = int(hv * float64(span) / (hv + av))
	}
	return "  " + theme.Muted.Render(theme.PadLeft(fmt.Sprintf("%.2f", hv), 5)) + " " +
		lipgloss.NewStyle().Foreground(theme.Cyan).Render(strings.Repeat("█", left)) +
		lipgloss.NewStyle().Foreground(theme.Magenta).Render(strings.Repeat("█", span-left)) +
		" " + theme.Muted.Render(theme.Pad(fmt.Sprintf("%.2f", av), 5)) +
		theme.TeamName.Render(theme.Upper(label))
}

func lineupLines(d *api.MatchDetail, width int) []line {
	t := i18n.T()
	var out []line
	for _, side := range []struct {
		name string
		l    api.TeamLineup
	}{
		{teamName(d.Home), d.Lineups.Home},
		{teamName(d.Away), d.Lineups.Away},
	} {
		head := theme.Upper(side.name)
		if side.l.Formation != nil && *side.l.Formation != "" {
			head += "   " + *side.l.Formation
		}
		out = append(out, plainLine(""),
			plainLine(" "+theme.MastheadName.Render(theme.Truncate(head, width-2))))
		if side.l.Coach != nil && *side.l.Coach != "" {
			out = append(out, plainLine(" "+theme.Muted.Render(theme.Truncate(
				theme.Upper(t.Coach)+" "+theme.Upper(*side.l.Coach), width-2))))
		}
		for _, p := range side.l.StartXI {
			out = append(out, plainLine(playerRow(p, width)))
		}
		if len(side.l.Substitutes) > 0 {
			out = append(out, plainLine(" "+theme.Muted.Render(theme.Upper(t.Bench))))
			for _, p := range side.l.Substitutes {
				out = append(out, plainLine(playerRow(p, width)))
			}
		}
	}
	return out
}

func playerRow(p api.LineupPlayer, width int) string {
	num := "  "
	if p.Number != nil {
		num = strconv.Itoa(*p.Number)
	}
	pos := "  "
	if p.Pos != nil {
		pos = *p.Pos
	}
	row := "  " + theme.Muted.Render(theme.PadLeft(num, 3)+" "+theme.Pad(pos, 2)) + " " +
		theme.TeamName.Render(theme.Upper(p.Name))
	// A rating of zero means unrated, not terrible — the API sends 0 for players
	// it has no opinion on, and printing it would invent a judgement.
	if p.Rating != nil && *p.Rating > 0 {
		row = theme.Pad(row, width-6) + theme.MastheadName.Render(fmt.Sprintf("%.1f", *p.Rating))
	}
	return theme.Truncate(row, width)
}
