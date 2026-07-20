// Package ui is the Bubble Tea program: one model, one update, one view.
package ui

import (
	"context"
	"time"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
)

// The API costs one request per competition regardless of range, so fetching a
// wide window up front is nearly free and makes day navigation instant.
const (
	windowBefore = 3
	windowAfter  = 10
	livePoll     = 15 * time.Second
)

type (
	scheduleMsg struct{ days []api.Day }
	liveMsg     struct{ matches []api.LiveMatch }
	errMsg      struct{ err error }
	tickMsg     time.Time
)

// Model is the whole application state.
type Model struct {
	client *api.Client
	ctx    context.Context

	days []api.Day
	idx  int

	vp            viewport.Model
	width, height int
	ready         bool
	loading       bool
	err           error
}

// New returns a model ready to be run by Bubble Tea.
func New(ctx context.Context) Model {
	return Model{client: api.New(), ctx: ctx, loading: true}
}

// Init kicks off the first fetch and the live-refresh ticker.
func (m Model) Init() tea.Cmd {
	return tea.Batch(m.fetchSchedule(), tick())
}

func tick() tea.Cmd {
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

func (m Model) fetchLive() tea.Cmd {
	return func() tea.Msg {
		live, err := m.client.Live(m.ctx)
		if err != nil {
			return nil // a failed live poll is not worth interrupting the page
		}
		return liveMsg{live}
	}
}

// Update folds a message into the model.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		// The viewport owns everything between the masthead and the key bar.
		h := max(msg.Height-chromeRows, 1)
		if !m.ready {
			m.vp = viewport.New(msg.Width, h)
			m.ready = true
		} else {
			m.vp.Width, m.vp.Height = msg.Width, h
		}
		m.vp.SetContent(m.body())
		return m, nil

	case tea.KeyMsg:
		return m.handleKey(msg)

	case scheduleMsg:
		m.loading, m.err, m.days = false, nil, msg.days
		m.idx = todayIndex(msg.days)
		m.vp.SetContent(m.body())
		m.vp.GotoTop()
		return m, nil

	case liveMsg:
		m.patchLive(msg.matches)
		m.vp.SetContent(m.body())
		return m, nil

	case errMsg:
		m.loading, m.err = false, msg.err
		m.vp.SetContent(m.body())
		return m, nil

	case tickMsg:
		return m, tea.Batch(m.fetchLive(), tick())
	}

	var cmd tea.Cmd
	m.vp, cmd = m.vp.Update(msg)
	return m, cmd
}

func (m Model) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "q", "ctrl+c", "c":
		return m, tea.Quit
	case "left", "r":
		return m.moveDay(-1)
	case "right", "g":
		return m.moveDay(1)
	}
	var cmd tea.Cmd
	m.vp, cmd = m.vp.Update(msg) // up/down/pgup/pgdn belong to the viewport
	return m, cmd
}

func (m Model) moveDay(delta int) (tea.Model, tea.Cmd) {
	if len(m.days) == 0 {
		return m, nil
	}
	m.idx = min(max(m.idx+delta, 0), len(m.days)-1)
	m.vp.SetContent(m.body())
	m.vp.GotoTop()
	return m, nil
}

func (m *Model) patchLive(live []api.LiveMatch) {
	byID := make(map[int]api.LiveMatch, len(live))
	for _, l := range live {
		byID[l.ID] = l
	}
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

// View assembles the page: masthead, body, key bar.
func (m Model) View() string {
	if !m.ready {
		return ""
	}
	return lipgloss.JoinVertical(lipgloss.Left, m.masthead(), m.vp.View(), m.keyBar())
}

func (m Model) day() *api.Day {
	if m.idx < 0 || m.idx >= len(m.days) {
		return nil
	}
	return &m.days[m.idx]
}

// todayIndex finds today in the fetched window, falling back to the next day
// present so the page is never blank because of a timezone edge.
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
