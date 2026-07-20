// Package theme is the teletext look, expressed once.
//
// Lipgloss makes it trivial to produce a generic terminal app — rounded
// borders, soft padding, gradients. Teletext is the opposite: eight saturated
// colours, solid full-width bands, square corners, upper case. Every style the
// views use lives here so that drift has to be deliberate rather than
// accidental.
//
// Deliberately absent: borders of any kind, padding beyond a single column, and
// any colour outside the eight below.
package theme

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/mattn/go-runewidth"
)

// The CEPT palette, matching the web client's cept1 theme so both render the
// same red. lipgloss.Color takes a hex string and degrades to the nearest
// terminal colour on its own when truecolor is unavailable.
const (
	Black   = lipgloss.Color("#000000")
	Red     = lipgloss.Color("#ff0000")
	Green   = lipgloss.Color("#00ff00")
	Yellow  = lipgloss.Color("#ffff00")
	Blue    = lipgloss.Color("#0000ff")
	Magenta = lipgloss.Color("#ff00ff")
	Cyan    = lipgloss.Color("#00ffff")
	White   = lipgloss.Color("#ffffff")
)

var (
	// Masthead is the page header: the app name, page number and date.
	Masthead = lipgloss.NewStyle().Background(Blue).Foreground(White)
	// MastheadName is the wordmark inside it.
	MastheadName = lipgloss.NewStyle().Background(Blue).Foreground(Yellow).Bold(true)
	// MastheadDim is secondary information in the header.
	MastheadDim = lipgloss.NewStyle().Background(Blue).Foreground(Cyan)

	// Time is a kickoff time.
	Time = lipgloss.NewStyle().Foreground(Cyan)
	// TeamName is a club name.
	TeamName = lipgloss.NewStyle().Foreground(White)
	// Score is a settled result.
	Score = lipgloss.NewStyle().Foreground(White)
	// ScorePending is the placeholder before kickoff.
	ScorePending = lipgloss.NewStyle().Foreground(Cyan)
	// ScoreLive is a score still moving.
	ScoreLive = lipgloss.NewStyle().Foreground(Yellow).Bold(true)
	// Broadcaster is the French rights holder.
	Broadcaster = lipgloss.NewStyle().Foreground(Yellow)
	// Muted is de-emphasised text. Teletext has no dim attribute; the quiet
	// colour is the only way down.
	Muted = lipgloss.NewStyle().Foreground(Cyan)
	// Alert is an error or a warning.
	Alert = lipgloss.NewStyle().Foreground(Red).Bold(true)

	// LiveTag marks a match in progress, reversed out like a teletext caption.
	LiveTag = lipgloss.NewStyle().Background(Red).Foreground(Black).Bold(true)
	// PostponedTag marks a fixture that will not be played as scheduled.
	PostponedTag = lipgloss.NewStyle().Background(Yellow).Foreground(Black)
)

// Band is a full-width solid header, the teletext section rule. The label is
// reversed out of the colour and the row is filled to the page width, because a
// band that stops at the text reads as a label rather than as a rule.
func Band(label string, bg lipgloss.Color, width int) string {
	return lipgloss.NewStyle().
		Background(bg).
		Foreground(Black).
		Bold(true).
		Width(width).
		Render(" " + strings.ToUpper(label))
}

// FastTextKey is one of the four coloured keys along the bottom, drawn as a
// colour flash followed by its reversed-out label.
func FastTextKey(label string, c lipgloss.Color) string {
	flash := lipgloss.NewStyle().Foreground(c).Render("▐")
	text := lipgloss.NewStyle().Background(c).Foreground(Black).Render(strings.ToUpper(label))
	return flash + text
}

// Pad left-aligns s in exactly w display columns, truncating with an ellipsis
// rather than letting a long club name push the column beside it out of line.
func Pad(s string, w int) string {
	if w <= 0 {
		return ""
	}
	if runewidth.StringWidth(s) > w {
		s = runewidth.Truncate(s, w, "…")
	}
	return s + strings.Repeat(" ", w-runewidth.StringWidth(s))
}

// PadLeft right-aligns s in exactly w display columns.
func PadLeft(s string, w int) string {
	if w <= 0 {
		return ""
	}
	if runewidth.StringWidth(s) > w {
		s = runewidth.Truncate(s, w, "…")
	}
	return strings.Repeat(" ", w-runewidth.StringWidth(s)) + s
}

// Width is the display width of s, honouring combining marks and wide runes.
func Width(s string) int { return runewidth.StringWidth(s) }

// Upper uppercases for display. Teletext is upper case throughout, and
// strings.ToUpper is Unicode-correct for French.
func Upper(s string) string { return strings.ToUpper(s) }
