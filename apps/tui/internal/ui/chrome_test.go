package ui

import (
	"strings"
	"testing"

	"github.com/salty-max/lucarne/apps/tui/internal/teletext"
	"github.com/salty-max/lucarne/apps/tui/internal/theme"
)

// Every line the shell emits is painted to exactly the page width. One column
// too many wraps, and a wrapped line shifts everything below it for the rest of
// the page — which is how a layout silently falls apart at one terminal size
// and not another.
func TestEveryChromeLineIsExactlyTheWidth(t *testing.T) {
	days := loadDays(t)
	for _, w := range []int{40, 56, 72, 100, 140} {
		m := modelAt(days, busiest(days), w)
		m.clock, m.date = "17:27:21", "LUN. 20 JUIL."

		lines := []string{
			m.serviceLine(w),
			fastRow(teletext.FastText, w),
			fastRow(teletext.More, w),
			kbdHint(w),
		}
		for _, l := range m.current().Lines(&m, w) {
			lines = append(lines, l.text)
		}

		for i, l := range lines {
			if got := theme.Rendered(theme.Screen(l, w)); got != w {
				t.Errorf("width %d: painted line %d is %d columns", w, i, got)
			}
		}
	}
}

// The hint sheds items rather than overflowing, and never sheds the first one:
// if only one hint fits, it must be the page-number one, which is the only
// thing a terminal user cannot discover by pressing keys at random.
func TestKbdHintShedsFromTheRight(t *testing.T) {
	wide := plain(kbdHint(140))
	if !strings.Contains(wide, "###") {
		t.Fatalf("wide hint lost the page-number cue: %q", wide)
	}

	prev := 99
	for _, w := range []int{140, 100, 72, 56, 40, 24} {
		h := plain(kbdHint(w))
		if theme.Width(h) > w {
			t.Errorf("width %d: hint is %d columns", w, theme.Width(h))
		}
		n := strings.Count(h, "  ") // one trailing gap per hint kept
		if n > prev {
			t.Errorf("width %d kept more hints (%d) than width above it (%d)", w, n, prev)
		}
		prev = n
		if h != "" && !strings.Contains(h, "###") {
			t.Errorf("width %d dropped the page-number cue before the others: %q", w, h)
		}
	}
}

// Screen must clip, not just pad — the pad-only version let an over-long line
// through, which is exactly the case that wraps.
func TestScreenClipsOverlongLines(t *testing.T) {
	long := strings.Repeat("X", 200)
	if got := theme.Rendered(theme.Screen(long, 40)); got != 40 {
		t.Errorf("over-long line painted to %d columns, want 40", got)
	}
	if got := theme.Rendered(theme.Screen("short", 40)); got != 40 {
		t.Errorf("short line painted to %d columns, want 40", got)
	}
}
