package ui

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

// A page with nothing selectable — the match detail is one — is scrolled rather
// than cursored. Up was a no-op there for a whole release: the fallback called
// LineDown with a negative count, which the viewport ignores, so the page could
// be scrolled to the bottom and never back.
func TestScrollUpWorksOnAPageWithoutSelection(t *testing.T) {
	d := loadMatch(t)
	m := New(t.Context())
	m.stack = []page{&matchPage{id: d.ID, data: d}}
	m = sized(m, 90, 20)

	if len(m.selectableIndexes()) != 0 {
		t.Fatal("this test needs a page with nothing selectable")
	}

	for i := 0; i < 12; i++ {
		next, _ := m.Update(tea.KeyMsg{Type: tea.KeyDown})
		m = next.(Model)
	}
	down := m.vp.YOffset
	if down == 0 {
		t.Fatal("the page did not scroll down at all")
	}

	for i := 0; i < 5; i++ {
		next, _ := m.Update(tea.KeyMsg{Type: tea.KeyUp})
		m = next.(Model)
	}
	if m.vp.YOffset >= down {
		t.Errorf("scrolling up moved from %d to %d", down, m.vp.YOffset)
	}
}

// Tab jumps to the next section heading and wraps; Shift+Tab goes back.
func TestTabJumpsBetweenSections(t *testing.T) {
	d := loadMatch(t)
	m := New(t.Context())
	m.stack = []page{&matchPage{id: d.ID, data: d}}
	m = sized(m, 90, 20)

	var heads []int
	for i, l := range m.lines {
		if l.section {
			heads = append(heads, i)
		}
	}
	if len(heads) < 3 {
		t.Fatalf("the match page has %d sections; expected several", len(heads))
	}

	// The requirement is that a section becomes visible, not that it lands on
	// the top row: near the end of a page the viewport clamps its offset, which
	// is correct — there is nothing below to scroll into.
	visible := func(m Model) bool {
		for _, h := range heads {
			if h >= m.vp.YOffset && h < m.vp.YOffset+m.vp.Height {
				return true
			}
		}
		return false
	}

	seen := map[int]bool{}
	for i := 0; i < len(heads)+1; i++ {
		next, _ := m.Update(tea.KeyMsg{Type: tea.KeyTab})
		m = next.(Model)
		seen[m.vp.YOffset] = true
		if !visible(m) {
			t.Fatalf("after Tab, no section is on screen (offset %d)", m.vp.YOffset)
		}
	}
	if len(seen) < 2 {
		t.Error("Tab never moved between sections")
	}

	next, _ := m.Update(tea.KeyMsg{Type: tea.KeyShiftTab})
	m = next.(Model)
	if !visible(m) {
		t.Errorf("after Shift+Tab, no section is on screen (offset %d)", m.vp.YOffset)
	}
}

// The schedule marks its day and competition bars too, so Tab is useful there
// as well rather than only on the detail page.
func TestScheduleHasSections(t *testing.T) {
	days := loadDays(t)
	m := New(t.Context())
	m.days, m.dayIdx, m.loading = days, busiest(days), false
	m = sized(m, 90, 20)

	n := 0
	for _, l := range m.lines {
		if l.section {
			n++
		}
	}
	if n == 0 {
		t.Error("the schedule marks no sections, so Tab does nothing there")
	}
}
