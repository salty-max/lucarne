package render

import (
	"strings"

	"github.com/mattn/go-runewidth"
)

// Column arithmetic. Every column on a teletext page is load-bearing, so one
// mis-measured string shifts everything below it. Width comes from
// go-runewidth rather than len() or a hand-rolled table: combining marks are
// zero-width and CJK is double, and those tables are a classic place for subtle
// rot.

// Width is the number of terminal columns s occupies.
func Width(s string) int { return runewidth.StringWidth(s) }

// Truncate cuts s to at most max columns. It never splits a rune and stops
// short rather than overshooting on a double-width character.
func Truncate(s string, max int) string {
	if max <= 0 {
		return ""
	}
	if runewidth.StringWidth(s) <= max {
		return s
	}
	var b strings.Builder
	w := 0
	for _, r := range s {
		rw := runewidth.RuneWidth(r)
		if w+rw > max {
			break
		}
		b.WriteRune(r)
		w += rw
	}
	return b.String()
}

// Ellipsis truncates and marks that it happened — a silently cut team name
// reads as a different team.
func Ellipsis(s string, max int) string {
	if max <= 0 {
		return ""
	}
	if runewidth.StringWidth(s) <= max {
		return s
	}
	if max == 1 {
		return "…"
	}
	return Truncate(s, max-1) + "…"
}

// PadEnd left-aligns s in exactly max columns, truncating if it does not fit.
func PadEnd(s string, max int) string {
	t := Truncate(s, max)
	return t + strings.Repeat(" ", maxInt(0, max-runewidth.StringWidth(t)))
}

// PadStart right-aligns s in exactly max columns.
func PadStart(s string, max int) string {
	t := Truncate(s, max)
	return strings.Repeat(" ", maxInt(0, max-runewidth.StringWidth(t))) + t
}

// Centre centres s in exactly max columns, biasing left on odd slack.
func Centre(s string, max int) string {
	t := Truncate(s, max)
	slack := maxInt(0, max-runewidth.StringWidth(t))
	left := slack / 2
	return strings.Repeat(" ", left) + t + strings.Repeat(" ", slack-left)
}

// Upper uppercases for display. Teletext is upper-case throughout. strings.ToUpper
// is Unicode-correct for French (é becomes É, still one column); the
// language-tagged caser in x/text only differs for cases like Turkish dotted i,
// which is not a dependency worth carrying here.
func Upper(s string) string { return strings.ToUpper(s) }

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
