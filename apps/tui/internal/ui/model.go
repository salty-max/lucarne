// Package ui is the Bubble Tea program: a teletext shell around a stack of
// pages, laid out to match the web client screen for screen.
package ui

import (
	"context"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
	"github.com/salty-max/lucarne/apps/tui/internal/teletext"
	"github.com/salty-max/lucarne/apps/tui/internal/theme"
)

const (
	windowBefore = 3
	windowAfter  = 10
	livePoll     = 15 * time.Second
	clockTick    = time.Second
	// entryTimeout matches the web client: a partial page number is forgotten
	// rather than left half-typed, so the next digit starts a fresh number.
	entryTimeout = 1200 * time.Millisecond
)

type (
	scheduleMsg struct{ days []api.Day }
	compsMsg    struct{ comps []api.CompetitionInfo }
	liveMsg     struct{ matches []api.LiveMatch }
	matchMsg    struct{ match *api.MatchDetail }
	errMsg      struct{ err error }
	tickMsg     time.Time
	clockMsg    time.Time
	entryMsg    int
)

// Model is the shell. Pages read the shared data from it and push their own
// state; the shell owns navigation, the cursor and the chrome.
type Model struct {
	client *api.Client
	ctx    context.Context

	stack []page
	lines []line
	cur   int

	days  []api.Day
	comps []api.CompetitionInfo

	entry    string
	entrySeq int // bumped per keystroke, so a stale timeout cannot clear a fresh entry
	clock    string
	date     string
	loading  bool
	err      error
	liveNow  int
	vp       viewport.Model
	width    int
	height   int
	ready    bool
	dayIdx   int
}

// New returns a model showing page 100.
func New(ctx context.Context) Model {
	m := Model{client: api.New(), ctx: ctx, loading: true}
	m.stack = []page{&todayPage{}}
	return m
}

func (m Model) current() page { return m.stack[len(m.stack)-1] }

func (m Model) liveCount() int { return m.liveNow }

// Init loads the shared data every page draws from, and starts the clock.
func (m Model) Init() tea.Cmd {
	return tea.Batch(m.fetchSchedule(), m.fetchComps(), livePollCmd(), clockCmd())
}

func clockCmd() tea.Cmd {
	return tea.Tick(clockTick, func(t time.Time) tea.Msg { return clockMsg(t) })
}

func livePollCmd() tea.Cmd {
	return tea.Tick(livePoll, func(t time.Time) tea.Msg { return tickMsg(t) })
}

func (m Model) fetchSchedule() tea.Cmd {
	return func() tea.Msg {
		from := time.Now().AddDate(0, 0, -windowBefore).Format("2006-01-02")
		days, err := m.client.Schedule(m.ctx, from, windowBefore+windowAfter+1)
		if err != nil {
			return errMsg{err}
		}
		return scheduleMsg{days}
	}
}

func (m Model) fetchComps() tea.Cmd {
	return func() tea.Msg {
		comps, err := m.client.Competitions(m.ctx)
		if err != nil {
			return nil // the schedule is the page that matters; this is chrome
		}
		return compsMsg{comps}
	}
}

func (m Model) fetchLive() tea.Cmd {
	return func() tea.Msg {
		live, err := m.client.Live(m.ctx)
		if err != nil {
			return nil
		}
		return liveMsg{live}
	}
}

// Update folds a message into the model.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		h := max(msg.Height-chromeHeight, 1)
		if !m.ready {
			m.vp = viewport.New(msg.Width, h)
			m.ready = true
		} else {
			m.vp.Width, m.vp.Height = msg.Width, h
		}
		m.refresh()
		return m, nil

	case tea.KeyMsg:
		next, cmd := m.handleKey(msg)
		return next, cmd

	case clockMsg:
		t := time.Time(msg)
		if loc, err := time.LoadLocation("Europe/Paris"); err == nil {
			t = t.In(loc)
		}
		m.clock, m.date = t.Format("15:04:05"), theme.Upper(t.Format("Mon 02 Jan"))
		return m, clockCmd()

	case entryMsg:
		// Only clear if no digit has been typed since this timeout was armed.
		if int(msg) == m.entrySeq {
			m.entry = ""
		}
		return m, nil

	case scheduleMsg:
		m.loading, m.err, m.days = false, nil, msg.days
		m.dayIdx = todayIndex(msg.days)
		m.refresh()
		return m, nil

	case compsMsg:
		m.comps = msg.comps
		m.refresh()
		return m, nil

	case liveMsg:
		m.patchLive(msg.matches)
		m.refresh()
		return m, nil

	case errMsg:
		m.loading, m.err = false, msg.err
		m.refresh()
		return m, nil

	case tickMsg:
		return m, tea.Batch(m.fetchLive(), livePollCmd())
	}

	// Anything the shell does not own belongs to the page — matchMsg and
	// competitionMsg among them. An earlier version answered matchMsg here and
	// returned, so the page never saw its own data and sat on "loading".
	if cmd, handled := m.current().Update(&m, msg); handled {
		m.refresh()
		return m, cmd
	}
	var cmd tea.Cmd
	m.vp, cmd = m.vp.Update(msg)
	return m, cmd
}

func (m *Model) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	key := msg.String()

	// Digits build a page number, exactly as on a set: three digits jump.
	if len(key) == 1 && key[0] >= '0' && key[0] <= '9' {
		m.entry += key
		if len(m.entry) > 3 {
			m.entry = m.entry[len(m.entry)-3:]
		}
		if len(m.entry) == 3 {
			no := m.entry
			m.entry = ""
			return *m, m.goToNumber(no)
		}
		m.entrySeq++
		seq := m.entrySeq
		return *m, tea.Tick(entryTimeout, func(time.Time) tea.Msg { return entryMsg(seq) })
	}

	// Give the page first refusal, so a page with its own keys can claim them.
	if cmd, handled := m.current().Update(m, msg); handled {
		m.refresh()
		return *m, cmd
	}

	switch key {
	case "q", "ctrl+c":
		return *m, tea.Quit

	case "backspace", "esc":
		return *m, m.back()

	case "tab":
		m.jumpSection(1)
		return *m, nil
	case "shift+tab":
		m.jumpSection(-1)
		return *m, nil

	case "up":
		m.moveCursor(-1)
		return *m, nil
	case "down":
		m.moveCursor(1)
		return *m, nil

	case "enter":
		if i := m.selected(); i >= 0 && m.lines[i].open != nil {
			return *m, m.lines[i].open(m)
		}
		return *m, nil
	}

	// The four colour keys.
	for _, k := range teletext.FastText {
		if key == k.Key {
			return *m, m.goToPage(k.No, "")
		}
	}

	var cmd tea.Cmd
	m.vp, cmd = m.vp.Update(msg)
	return *m, cmd
}

// goToNumber resolves a typed number. An unassigned one does nothing, as on a
// real set: typing a dead page left you where you were.
func (m *Model) goToNumber(no string) tea.Cmd {
	p, slug, ok := teletext.Resolve(no, m.comps)
	if !ok {
		return nil
	}
	return m.goToPage(p, slug)
}

func (m *Model) back() tea.Cmd {
	if len(m.stack) <= 1 {
		return nil
	}
	m.stack = m.stack[:len(m.stack)-1]
	m.cur = 0
	m.refresh()
	m.vp.GotoTop()
	return nil
}

func (m *Model) push(p page) tea.Cmd {
	m.stack = append(m.stack, p)
	m.cur = 0
	m.refresh()
	m.vp.GotoTop()
	return nil
}

// jumpSection scrolls to the next or previous section heading, wrapping. On a
// page of a hundred lines this is the difference between navigating and
// scrolling.
func (m *Model) jumpSection(delta int) {
	var heads []int
	for i, l := range m.lines {
		if l.section {
			heads = append(heads, i)
		}
	}
	if len(heads) == 0 {
		return
	}

	cur := m.vp.YOffset
	target := heads[0]
	if delta > 0 {
		target = heads[0]
		for _, h := range heads {
			if h > cur {
				target = h
				break
			}
		}
	} else {
		target = heads[len(heads)-1]
		for i := len(heads) - 1; i >= 0; i-- {
			if heads[i] < cur {
				target = heads[i]
				break
			}
		}
	}
	m.vp.SetYOffset(target)
}

// moveCursor walks the selectable lines, wrapping as the web client does.
func (m *Model) moveCursor(delta int) {
	sel := m.selectableIndexes()
	if len(sel) == 0 {
		// LineDown ignores a negative count, so a page with nothing selectable
		// — the match detail, for one — could be scrolled down but never up.
		if delta < 0 {
			m.vp.LineUp(-delta)
		} else {
			m.vp.LineDown(delta)
		}
		return
	}
	pos := 0
	for i, idx := range sel {
		if idx == m.cur {
			pos = i
			break
		}
	}
	pos = (pos + delta + len(sel)) % len(sel)
	m.cur = sel[pos]
	m.refresh()
	m.ensureVisible()
}

func (m *Model) selectableIndexes() []int {
	var out []int
	for i, l := range m.lines {
		if l.open != nil {
			out = append(out, i)
		}
	}
	return out
}

func (m Model) selected() int {
	if m.cur >= 0 && m.cur < len(m.lines) {
		return m.cur
	}
	return -1
}

// ensureVisible scrolls just enough to keep the cursor on screen, the way
// scrollIntoView({block:"nearest"}) does on the web.
func (m *Model) ensureVisible() {
	top := m.vp.YOffset
	bottom := top + m.vp.Height - 1
	switch {
	case m.cur < top:
		m.vp.SetYOffset(m.cur)
	case m.cur > bottom:
		m.vp.SetYOffset(m.cur - m.vp.Height + 1)
	}
}

// refresh re-renders the current page into the viewport.
func (m *Model) refresh() {
	if !m.ready {
		return
	}
	m.lines = m.current().Lines(m, m.width)
	if m.cur >= len(m.lines) {
		m.cur = 0
	}
	rows := make([]string, len(m.lines))
	for i, l := range m.lines {
		// The selected row is filled across its full width. That flattens the
		// tags and colours it carries into one block, which is the trade: a
		// terminal has no outline, so the only unmissable highlight is a solid
		// one.
		if i == m.cur && l.open != nil {
			rows[i] = theme.Cursor.Render(theme.Pad(theme.Plain(l.text), m.width))
		} else {
			rows[i] = l.text
		}
	}
	m.vp.SetContent(strings.Join(rows, "\n"))
}

func (m *Model) patchLive(live []api.LiveMatch) {
	byID := make(map[int]api.LiveMatch, len(live))
	for _, l := range live {
		byID[l.ID] = l
	}
	m.liveNow = len(live)
	for di := range m.days {
		for mi := range m.days[di].Matches {
			f := &m.days[di].Matches[mi]
			l, ok := byID[f.ID]
			if !ok {
				continue
			}
			f.Status, f.Elapsed = l.Status, l.Elapsed
			f.HomeGoals, f.AwayGoals = l.HomeGoals, l.AwayGoals
			f.HomePenalties, f.AwayPenalties = l.HomePenalties, l.AwayPenalties
		}
	}
}

// View assembles service line, page, footer rows and hint.
func (m Model) View() string {
	if !m.ready {
		return ""
	}
	parts := []string{m.serviceLine(m.width)}
	parts = append(parts, strings.Split(m.vp.View(), "\n")...)
	parts = append(parts,
		fastRow(teletext.FastText, m.width),
		fastRow(teletext.More, m.width),
		"",
		kbdHint(m.width))

	// Paint every line to the edge so the page is a black screen rather than
	// text sitting on the terminal's own background.
	for i, l := range parts {
		parts[i] = theme.Screen(l, m.width)
	}
	return strings.Join(parts, "\n")
}

func todayIndex(days []api.Day) int {
	today := time.Now().Format("2006-01-02")
	for i, d := range days {
		if d.Key == today {
			return i
		}
	}
	for i, d := range days {
		if d.Key >= today {
			return i
		}
	}
	return 0
}

// competitionMsg carries a fetched competition, tagged with the slug so a
// pending request for a page the user has already left cannot overwrite the
// page they are now on.
type competitionMsg struct {
	slug   string
	detail *api.CompetitionDetail
}

func (m Model) fetchCompetition(slug string) tea.Cmd {
	return func() tea.Msg {
		d, err := m.client.Competition(m.ctx, slug)
		if err != nil {
			return errMsg{err}
		}
		return competitionMsg{slug: slug, detail: d}
	}
}

func (m Model) fetchMatch(id int) tea.Cmd {
	return func() tea.Msg {
		d, err := m.client.Match(m.ctx, id)
		if err != nil {
			return errMsg{err}
		}
		return matchMsg{match: d}
	}
}
