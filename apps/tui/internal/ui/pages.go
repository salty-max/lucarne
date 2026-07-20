package ui

import (
	"strconv"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
	"github.com/salty-max/lucarne/apps/tui/internal/i18n"
	"github.com/salty-max/lucarne/apps/tui/internal/teletext"
	"github.com/salty-max/lucarne/apps/tui/internal/theme"
)

// goToPage replaces the stack with the requested section. Colour keys and typed
// numbers are jumps, not descents: only opening an item from within a page adds
// to the stack, which is what makes Backspace mean "the page I came from".
func (m *Model) goToPage(p teletext.Page, slug string) tea.Cmd {
	var next page
	switch p {
	case teletext.PageToday:
		next = &todayPage{}
	case teletext.PageCalendar:
		next = &calendarPage{}
	case teletext.PageCompetitions:
		next = &competitionsPage{}
	case teletext.PageBroadcasters:
		next = &stubPage{no: p, title: "Broadcasters", note: "Rights holders and coverage."}
	case teletext.PageFavorites:
		next = &stubPage{no: p, title: "My teams", note: "Followed teams live on the device."}
	case teletext.PageRadar:
		next = &stubPage{no: p, title: "Radar", note: "Matches under surveillance."}
	case teletext.PageSettings:
		next = &stubPage{no: p, title: "Settings", note: "Theme, language, notifications."}
	case teletext.PageLogs:
		next = &stubPage{no: p, title: "Logs", note: "Scheduled job history."}
	default:
		if slug != "" {
			next = &competitionPage{slug: slug}
			m.stack = []page{next}
			m.cur = 0
			m.refresh()
			m.vp.GotoTop()
			return m.fetchCompetition(slug)
		}
		return nil
	}
	m.stack = []page{next}
	m.cur = 0
	m.refresh()
	m.vp.GotoTop()
	return nil
}

// ── 100 · Today ─────────────────────────────────────────────────────────────

type todayPage struct{}

func (p *todayPage) Number() teletext.Page                  { return teletext.PageToday }
func (p *todayPage) Header() (string, string)               { return i18n.T().Today, i18n.T().TodaySub }
func (p *todayPage) Update(*Model, tea.Msg) (tea.Cmd, bool) { return nil, false }

func (p *todayPage) Lines(m *Model, width int) []line {
	return fixtureLines(m, m.dayAt(m.dayIdx), width, i18n.T().Today, i18n.T().TodaySub)
}

// ── 300 · Calendar ──────────────────────────────────────────────────────────

type calendarPage struct{}

func (p *calendarPage) Number() teletext.Page    { return teletext.PageCalendar }
func (p *calendarPage) Header() (string, string) { return i18n.T().Calendar, i18n.T().CalendarSub }

// Left and right step through days here, which is what the web client's
// calendar arrows do.
func (p *calendarPage) Update(m *Model, msg tea.Msg) (tea.Cmd, bool) {
	k, ok := msg.(tea.KeyMsg)
	if !ok {
		return nil, false
	}
	switch k.String() {
	case "left":
		m.dayIdx = max(m.dayIdx-1, 0)
		return nil, true
	case "right":
		m.dayIdx = min(m.dayIdx+1, max(len(m.days)-1, 0))
		return nil, true
	}
	return nil, false
}

func (p *calendarPage) Lines(m *Model, width int) []line {
	out := headerLines(i18n.T().Calendar, i18n.T().CalendarSub, width)
	for i := range m.days {
		d := m.days[i]
		idx := i
		label := theme.Pad(theme.Upper(i18n.DayLabel(d.Key)), width-14)
		count := theme.PadLeft(plural(len(d.Matches), i18n.T().MatchOne, i18n.T().MatchMany), 12)
		style := theme.TeamName
		if i == m.dayIdx {
			style = theme.MastheadName
		}
		out = append(out, line{
			text: " " + style.Render(label) + theme.Muted.Render(count),
			open: func(m *Model) tea.Cmd {
				m.dayIdx = idx
				return m.goToPage(teletext.PageToday, "")
			},
		})
	}
	return out
}

// ── 400 · Competitions ──────────────────────────────────────────────────────

type competitionsPage struct{}

func (p *competitionsPage) Number() teletext.Page { return teletext.PageCompetitions }
func (p *competitionsPage) Header() (string, string) {
	return i18n.T().Competitions, i18n.T().CompetitionsSub
}
func (p *competitionsPage) Update(*Model, tea.Msg) (tea.Cmd, bool) { return nil, false }

func (p *competitionsPage) Lines(m *Model, width int) []line {
	out := headerLines(i18n.T().Competitions, i18n.T().CompetitionsSub, width)
	if len(m.comps) == 0 {
		return append(out, plainLine(theme.Muted.Render(" "+theme.Upper(i18n.T().Loading))))
	}
	for i := range m.comps {
		c := m.comps[i]
		no := string(teletext.CompPageNo(i))
		slug := c.Slug
		text := " " + theme.EntryStyle.Render(no) + "  " +
			theme.TeamName.Render(theme.Pad(theme.Upper(c.Name), width-22)) +
			theme.Muted.Render(theme.PadLeft(theme.Upper(c.Country), 14))
		out = append(out, line{
			text: text,
			open: func(m *Model) tea.Cmd {
				cmd := m.push(&competitionPage{slug: slug})
				return tea.Batch(cmd, m.fetchCompetition(slug))
			},
		})
	}
	return out
}

// ── 41x · One competition ───────────────────────────────────────────────────

type competitionPage struct {
	slug string
	data *api.CompetitionDetail
}

func (p *competitionPage) Number() teletext.Page {
	return teletext.CompetitionPage(p.slug, nil)
}

func (p *competitionPage) Header() (string, string) {
	if p.data != nil {
		return p.data.Name, p.data.Country
	}
	return "Competition", ""
}

func (p *competitionPage) Update(m *Model, msg tea.Msg) (tea.Cmd, bool) {
	if d, ok := msg.(competitionMsg); ok && d.slug == p.slug {
		p.data = d.detail
		return nil, true
	}
	return nil, false
}

func (p *competitionPage) Lines(m *Model, width int) []line {
	if p.data == nil {
		return append(headerLines("Competition", "", width),
			plainLine(theme.Muted.Render(" "+theme.Upper(i18n.T().Loading))))
	}
	out := headerLines(p.data.Name, p.data.Country, width)

	for _, g := range p.data.Standings {
		out = append(out, plainLine(""),
			plainLine(theme.SectionLabel(g.Label, theme.Cyan, width)))
		out = append(out, plainLine(standingsHead(width)))
		for _, r := range g.Rows {
			out = append(out, plainLine(standingsRow(r, width)))
		}
	}

	if len(p.data.TopScorers) > 0 {
		out = append(out, plainLine(""),
			plainLine(theme.SectionLabel("Top scorers", theme.Green, width)))
		for _, e := range p.data.TopScorers {
			out = append(out, plainLine(topPlayerRow(e, width)))
		}
	}
	if len(p.data.TopAssists) > 0 {
		out = append(out, plainLine(""),
			plainLine(theme.SectionLabel("Top assists", theme.Magenta, width)))
		for _, e := range p.data.TopAssists {
			out = append(out, plainLine(topPlayerRow(e, width)))
		}
	}
	return out
}

// ── 900 · One match ─────────────────────────────────────────────────────────

type matchPage struct {
	id   int
	data *api.MatchDetail
}

func (p *matchPage) Number() teletext.Page { return teletext.PageMatch }

func (p *matchPage) Header() (string, string) {
	if p.data != nil {
		return teamName(p.data.Home) + " v " + teamName(p.data.Away), p.data.Competition.Name
	}
	return "Match", ""
}

func (p *matchPage) Update(m *Model, msg tea.Msg) (tea.Cmd, bool) {
	if d, ok := msg.(matchMsg); ok && d.match != nil && d.match.ID == p.id {
		p.data = d.match
		return nil, true
	}
	return nil, false
}

func (p *matchPage) Lines(m *Model, width int) []line {
	if p.data == nil {
		return append(headerLines("Match", "", width),
			plainLine(theme.Muted.Render(" "+theme.Upper(i18n.T().Loading))))
	}
	d := p.data
	out := headerLines(teamName(d.Home)+" v "+teamName(d.Away), d.Competition.Name, width)

	out = append(out, plainLine(""), plainLine(" "+scoreboard(*d)))
	if d.Venue != nil && *d.Venue != "" {
		out = append(out, plainLine(theme.Muted.Render(" "+theme.Upper(*d.Venue))))
	}
	if d.Referee != nil && *d.Referee != "" {
		out = append(out, plainLine(theme.Muted.Render(" REFEREE "+theme.Upper(*d.Referee))))
	}

	if len(d.Broadcasters) > 0 {
		out = append(out, plainLine(""),
			plainLine(theme.SectionLabel("Broadcast", theme.Yellow, width)),
			plainLine(" "+theme.Broadcaster.Render(broadcasters(d.Match))))
	}

	if len(d.Events) > 0 {
		out = append(out, plainLine(""),
			plainLine(theme.SectionLabel("Events", theme.Red, width)))
		for _, e := range d.Events {
			out = append(out, plainLine(eventRow(e, width)))
		}
	}
	return out
}

// ── Placeholder for sections not ported yet ─────────────────────────────────

// stubPage keeps every number in the table reachable. A page that says what it
// will be is better than a number that silently does nothing, which is
// indistinguishable from a broken build.
type stubPage struct {
	no    teletext.Page
	title string
	note  string
}

func (p *stubPage) Number() teletext.Page                  { return p.no }
func (p *stubPage) Header() (string, string)               { return p.title, "" }
func (p *stubPage) Update(*Model, tea.Msg) (tea.Cmd, bool) { return nil, false }

func (p *stubPage) Lines(m *Model, width int) []line {
	return append(headerLines(p.title, "", width),
		plainLine(""),
		plainLine(theme.Muted.Render(" "+theme.Upper(p.note))),
		plainLine(""),
		plainLine(theme.Alert.Render(" "+theme.Upper(i18n.T().NotYet))),
	)
}

// ── Shared helpers ──────────────────────────────────────────────────────────

// headerLines is the web client's PageHeader: a cyan title, an optional
// subtitle, and the seven-colour rule under both.
func headerLines(title, subtitle string, width int) []line {
	out := []line{
		plainLine(""),
		plainLine(" " + theme.PageTitle.Render(theme.Upper(title))),
	}
	if subtitle != "" {
		out = append(out, plainLine(" "+theme.Muted.Render(theme.Upper(subtitle))))
	}
	return append(out, plainLine(theme.Rainbow(width)), plainLine(""))
}

func (m Model) dayAt(i int) *api.Day {
	if i < 0 || i >= len(m.days) {
		return nil
	}
	return &m.days[i]
}

func plural(n int, one, many string) string {
	word := many
	if n == 1 {
		word = one
	}
	return strconv.Itoa(n) + " " + theme.Upper(word)
}
