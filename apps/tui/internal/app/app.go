// Package app is the event loop: input, timers and network on one side, a
// single repaint on the other.
package app

import (
	"context"
	"time"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
	"github.com/salty-max/lucarne/apps/tui/internal/pages"
	"github.com/salty-max/lucarne/apps/tui/internal/render"
	"github.com/salty-max/lucarne/apps/tui/internal/tui"
)

// How far either side of today the schedule is fetched in one call, and how
// often live scores are refreshed. The API costs one request per competition
// regardless of range, so a wide window is nearly free and makes day navigation
// instant.
const (
	windowBefore = 3
	windowAfter  = 10
	livePoll     = 15 * time.Second
)

// App holds everything the loop mutates. Nothing else touches these fields:
// background work posts a closure to apply, so there is one writer.
type App struct {
	term *tui.Terminal
	scr  *render.Screen
	cl   *api.Client

	days []api.Day
	idx  int
	page *pages.Schedule

	apply chan func()
}

// New wires an app around an already-open terminal.
func New(t *tui.Terminal) *App {
	return &App{
		term:  t,
		scr:   render.NewScreen(),
		cl:    api.New(),
		page:  &pages.Schedule{},
		apply: make(chan func(), 8),
	}
}

// Run blocks until the user quits or ctx is cancelled.
func (a *App) Run(ctx context.Context) error {
	keys := a.term.Keys()
	ticker := time.NewTicker(livePoll)
	defer ticker.Stop()

	a.loadSchedule(ctx)
	a.draw()

	for {
		select {
		case <-ctx.Done():
			return nil

		case fn, ok := <-a.apply:
			if !ok {
				return nil
			}
			fn()
			a.draw()

		case <-a.term.Resize:
			// The page size is fixed; only its position moves, so the previous
			// frame is meaningless and every cell must be repainted.
			a.scr.Invalidate()
			a.term.WriteString("\x1b[2J")
			a.draw()

		case <-ticker.C:
			a.refreshLive(ctx)

		case k, ok := <-keys:
			if !ok {
				return nil
			}
			if a.handle(k) {
				return nil
			}
			a.draw()
		}
	}
}

// handle applies a keypress and reports whether the app should exit.
func (a *App) handle(k tui.Key) bool {
	switch k.Type {
	case tui.KeyCtrlC:
		return true
	case tui.KeyLeft:
		a.moveDay(-1)
	case tui.KeyRight:
		a.moveDay(1)
	case tui.KeyUp:
		a.page.Scroll = max(0, a.page.Scroll-1)
	case tui.KeyDown:
		a.page.Scroll = min(a.page.MaxScroll(), a.page.Scroll+1)
	case tui.KeyPageUp:
		a.page.Scroll = max(0, a.page.Scroll-10)
	case tui.KeyPageDown:
		a.page.Scroll = min(a.page.MaxScroll(), a.page.Scroll+10)
	case tui.KeyRune:
		switch k.Rune {
		case 'q', 'Q':
			return true
		case 'r', 'R': // FastText red
			a.moveDay(-1)
		case 'g', 'G': // green
			a.moveDay(1)
		case 'c', 'C': // cyan
			return true
		}
	}
	return false
}

func (a *App) moveDay(delta int) {
	if len(a.days) == 0 {
		return
	}
	a.idx = min(max(a.idx+delta, 0), len(a.days)-1)
	a.page.Day = &a.days[a.idx]
	a.page.Scroll = 0
}

func (a *App) loadSchedule(ctx context.Context) {
	from := time.Now().AddDate(0, 0, -windowBefore).Format("2006-01-02")
	days, err := a.cl.Schedule(ctx, from, windowBefore+windowAfter+1)
	if err != nil {
		a.page.Err = err
		return
	}
	a.page.Err = nil
	a.days = days
	a.idx = todayIndex(days)
	if len(days) > 0 {
		a.page.Day = &a.days[a.idx]
	}
}

// refreshLive patches scores in place rather than refetching the schedule: the
// renderer then repaints only the cells that moved.
func (a *App) refreshLive(ctx context.Context) {
	go func() {
		live, err := a.cl.Live(ctx)
		if err != nil || len(live) == 0 {
			return
		}
		select {
		case a.apply <- func() { a.patchLive(live) }:
		default: // the loop is busy; the next tick will catch up
		}
	}()
}

func (a *App) patchLive(live []api.LiveMatch) {
	byID := make(map[int]api.LiveMatch, len(live))
	for _, l := range live {
		byID[l.ID] = l
	}
	for di := range a.days {
		for mi := range a.days[di].Matches {
			m := &a.days[di].Matches[mi]
			l, ok := byID[m.ID]
			if !ok {
				continue
			}
			m.Status, m.Elapsed = l.Status, l.Elapsed
			m.HomeGoals, m.AwayGoals = l.HomeGoals, l.AwayGoals
			m.HomePenalties, m.AwayPenalties = l.HomePenalties, l.AwayPenalties
		}
	}
}

func (a *App) draw() {
	a.page.Render(a.scr)
	cols, rows := a.term.Size()
	a.term.WriteString(a.scr.Render(cols, rows))
	a.term.Flush()
}

// todayIndex finds today in the fetched window, falling back to the first day
// so the page is never blank because of a timezone edge.
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
