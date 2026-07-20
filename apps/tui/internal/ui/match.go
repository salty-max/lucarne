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
			"  ★ "+theme.Strong.Render(theme.Upper(d.Motm.Name))+
				theme.Muted.Render(fmt.Sprintf("   %.1f", d.Motm.Rating)), width)))
	}

	if d.Lineups != nil {
		out = append(out, section(t.Lineups, width)...)
		out = append(out, lineupLines(d, width)...)
	}

	// Where to watch is the reason the app exists; it had no section at all.
	if len(d.Broadcasters) > 0 {
		out = append(out, section(t.WhereToWatch, width)...)
		out = append(out, broadcastLines(d.Broadcasters, width)...)
	}

	out = append(out, section(t.Info, width)...)
	out = append(out, infoLines(d, width)...)

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
			hs = theme.Strong
		case *d.AwayGoals > *d.HomeGoals:
			as = theme.Strong
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
	if len(note) > 0 {
		out = append(out, plainLine("  "+theme.Muted.Render(
			theme.Truncate(strings.Join(note, "  ·  "), width-3))))
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
		{t.ShotsOff, s.Home.ShotsOffTarget, s.Away.ShotsOffTarget, ""},
		{t.ShotsBlocked, s.Home.BlockedShots, s.Away.BlockedShots, ""},
		{t.ShotsIn, s.Home.ShotsInsideBox, s.Away.ShotsInsideBox, ""},
		{t.ShotsOut, s.Home.ShotsOutsideBox, s.Away.ShotsOutsideBox, ""},
		{t.Corners, s.Home.Corners, s.Away.Corners, ""},
		{t.Fouls, s.Home.Fouls, s.Away.Fouls, ""},
		{t.YellowCards, s.Home.YellowCards, s.Away.YellowCards, ""},
		{t.RedCards, s.Home.RedCards, s.Away.RedCards, ""},
		{t.Offsides, s.Home.Offsides, s.Away.Offsides, ""},
		{t.Saves, s.Home.Saves, s.Away.Saves, ""},
		{t.PassAccuracy, s.Home.PassAccuracy, s.Away.PassAccuracy, "%"},
	}

	var out []line
	for _, r := range rows {
		if r.h == nil && r.a == nil {
			continue
		}
		out = append(out, statRow(r.label,
			valueOf(r.h)+r.unit, valueOf(r.a)+r.unit, deref(r.h), deref(r.a), width)...)
	}
	if s.Home.XG != nil || s.Away.XG != nil {
		h, a := derefF(s.Home.XG), derefF(s.Away.XG)
		out = append(out, statRow(t.XG,
			fmt.Sprintf("%.2f", h), fmt.Sprintf("%.2f", a),
			int(h*100), int(a*100), width)...)
	}
	return out
}

func deref(v *int) int {
	if v == nil {
		return 0
	}
	return *v
}

func derefF(v *float64) float64 {
	if v == nil {
		return 0
	}
	return *v
}

func valueOf(v *int) string {
	if v == nil {
		return "-"
	}
	return strconv.Itoa(*v)
}

// statRow sets the figures on either side of a centred label, as the web client
// does, with a bar under it carrying the ratio. The figures are what is read;
// the bar is the shape of the difference.
//
// It returns two lines rather than one string with a newline in it: a line is a
// row, and packing two into one breaks the cursor, the scrolling and the width
// check all at once.
func statRow(label, hs, as string, h, a, width int) []line {
	side := 6
	mid := max(width-2*side-6, 6)

	head := "  " + theme.Strong.Render(theme.PadLeft(hs, side)) + "  " +
		theme.Muted.Render(theme.Centre(theme.Upper(label), mid)) + "  " +
		theme.Strong.Render(theme.Pad(as, side))
	out := []line{plainLine(theme.Truncate(head, width))}

	if h+a > 0 {
		left := h * mid / (h + a)
		bar := lipgloss.NewStyle().Foreground(theme.Cyan).Render(strings.Repeat("▔", left)) +
			lipgloss.NewStyle().Foreground(theme.Magenta).Render(strings.Repeat("▔", mid-left))
		out = append(out, plainLine(theme.Truncate("  "+strings.Repeat(" ", side+2)+bar, width)))
	}
	return out
}

// lineupLines set the two sides side by side, as the web client does, with the
// formations over them and the coaches under.
func lineupLines(d *api.MatchDetail, width int) []line {
	t := i18n.T()
	h, a := d.Lineups.Home, d.Lineups.Away
	col := max((width-3)/2, 12)

	form := func(l api.TeamLineup) string {
		if l.Formation != nil {
			return *l.Formation
		}
		return ""
	}
	out := []line{plainLine("  " +
		theme.Strong.Render(theme.Pad(form(h), col)) + " " +
		theme.Strong.Render(theme.Pad(form(a), col)))}

	pair := func(left, right []api.LineupPlayer) {
		n := max(len(left), len(right))
		for i := 0; i < n; i++ {
			var l, r string
			if i < len(left) {
				l = playerCell(left[i], col)
			}
			if i < len(right) {
				r = playerCell(right[i], col)
			}
			out = append(out, plainLine("  "+theme.Pad(l, col)+" "+theme.Pad(r, col)))
		}
	}
	pair(h.StartXI, a.StartXI)

	if len(h.Substitutes) > 0 || len(a.Substitutes) > 0 {
		out = append(out, plainLine(""),
			plainLine("  "+theme.Muted.Render(theme.Upper(t.Bench))))
		pair(h.Substitutes, a.Substitutes)
	}

	coach := func(l api.TeamLineup) string {
		if l.Coach == nil || *l.Coach == "" {
			return ""
		}
		return theme.Upper(t.Coach) + " " + theme.Upper(*l.Coach)
	}
	if coach(h) != "" || coach(a) != "" {
		out = append(out, plainLine(""),
			plainLine("  "+theme.Muted.Render(theme.Pad(coach(h), col))+" "+
				theme.Muted.Render(theme.Pad(coach(a), col))))
	}
	return out
}

// playerCell is one side's entry: shirt number, name, rating.
func playerCell(p api.LineupPlayer, w int) string {
	num := "  "
	if p.Number != nil {
		num = strconv.Itoa(*p.Number)
	}
	rating := ""
	// Zero means the API had no opinion, not a bad game; printing it would
	// invent a judgement.
	if p.Rating != nil && *p.Rating > 0 {
		rating = fmt.Sprintf("%.1f", *p.Rating)
	}
	// 3 for the number, 4 for the rating, 2 for the gaps between them.
	nameW := max(w-9, 4)
	return theme.Muted.Render(theme.PadLeft(num, 3)) + " " +
		theme.TeamName.Render(theme.Pad(theme.Upper(p.Name), nameW)) + " " +
		theme.Strong.Render(theme.PadLeft(rating, 4))
}

// broadcastLines list who carries the match, with the coverage and any note —
// "partial" and its note are the difference between watching the game and
// finding out you cannot.
func broadcastLines(bs []api.Broadcaster, width int) []line {
	t := i18n.T()
	var out []line
	for _, b := range bs {
		cover := t.Full
		col := theme.Green
		if b.Coverage == "partial" {
			cover, col = t.Partial, theme.Yellow
		}
		row := "  " + theme.Tag(b.Name, col) + "  " + theme.Muted.Render(theme.Upper(cover))
		if b.Note != nil && *b.Note != "" {
			row += theme.Muted.Render(" · " + theme.Upper(i18n.Note(*b.Note)))
		}
		out = append(out, plainLine(theme.Truncate(row, width)))
	}
	return out
}

// infoLines are the labelled facts the web client lists last.
func infoLines(d *api.MatchDetail, width int) []line {
	t := i18n.T()
	rows := [][2]string{
		{t.Date, i18n.DayLabel(kickoffDay(d.Kickoff))},
		{t.KickOff, kickoff(d.Kickoff) + " · Europe/Paris"},
	}
	if d.Venue != nil && *d.Venue != "" {
		rows = append(rows, [2]string{t.Venue, *d.Venue})
	}
	if d.Referee != nil && *d.Referee != "" {
		rows = append(rows, [2]string{t.Referee, *d.Referee})
	}
	rows = append(rows, [2]string{t.Competition, i18n.Competition(d.Competition.Name)})
	if d.Round != nil && *d.Round != "" {
		rows = append(rows, [2]string{t.Round, i18n.Round(*d.Round)})
	}

	label := 16
	var out []line
	for _, r := range rows {
		out = append(out, plainLine(theme.Truncate(
			"  "+theme.Muted.Render(theme.Pad(theme.Upper(r[0]), label))+
				theme.TeamName.Render(theme.Upper(r[1])), width)))
	}
	return out
}

// kickoffDay is the ISO date part, for the localised day label.
func kickoffDay(iso string) string {
	if len(iso) >= 10 {
		return iso[:10]
	}
	return iso
}
