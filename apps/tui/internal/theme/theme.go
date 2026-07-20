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
	"regexp"
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

// ── Primitives ported from the web client's components ──────────────────────
//
// Same names, same structure: PageHeader is a cyan title over the seven-colour
// rule, SectionLabel is a full-width colour bar, Tag is a solid colour block.
// Matching them keeps the two clients recognisably the same product.

// ByName maps the palette names the navigation table uses to colours, so that
// table stays free of styling.
func ByName(name string) lipgloss.Color {
	switch name {
	case "red":
		return Red
	case "green":
		return Green
	case "yellow":
		return Yellow
	case "blue":
		return Blue
	case "magenta":
		return Magenta
	case "cyan":
		return Cyan
	default:
		return White
	}
}

// Rainbow is the signature seven-colour rule under a heading. The web client
// draws it as a 7-column grid; here each colour takes an equal run of blocks.
func Rainbow(width int) string {
	order := []lipgloss.Color{Red, Green, Yellow, Blue, Magenta, Cyan, White}
	var b strings.Builder
	for i, c := range order {
		// Distribute the remainder across the first colours so the rule fills
		// the row exactly rather than stopping short.
		w := width / 7
		if i < width%7 {
			w++
		}
		b.WriteString(lipgloss.NewStyle().Background(c).Render(strings.Repeat(" ", w)))
	}
	return b.String()
}

// PageHeader is a page title over the rainbow rule: the web client's
// PageHeader, whose title is cyan and set in the one size step teletext had.
func PageHeader(title, subtitle string, width int) string {
	var b strings.Builder
	b.WriteString(lipgloss.NewStyle().Foreground(Cyan).Bold(true).Render(Upper(title)))
	b.WriteString("\n")
	if subtitle != "" {
		b.WriteString(Muted.Render(Upper(subtitle)))
		b.WriteString("\n")
	}
	b.WriteString(Rainbow(width))
	return b.String()
}

// SectionLabel is the full-width colour bar the web client uses for section
// headings — cyan by default, red while a section is live.
func SectionLabel(label string, c lipgloss.Color, width int) string {
	return Band(label, c, width)
}

// Tag is a solid colour block: a broadcaster pill or a status flag.
func Tag(label string, c lipgloss.Color) string {
	return lipgloss.NewStyle().Background(c).Foreground(Black).Bold(true).
		Render(" " + Upper(label) + " ")
}

// Key renders a keyboard hint the way the web client's .k class does: reversed
// out of white, so the instruction line reads as keys rather than as prose.
func Key(label string) string {
	return lipgloss.NewStyle().Background(White).Foreground(Black).Bold(true).Render(label)
}

// EntryStyle echoes the page number being typed, as the web client's .entry
// does — magenta, so it reads as input rather than as content.
var EntryStyle = lipgloss.NewStyle().Foreground(Magenta).Bold(true)

// Rendered is the display width of a string that already contains escape
// sequences. Width measures raw text and would count the escapes.
func Rendered(s string) int { return lipgloss.Width(s) }

// FastCell is one cell of the FastText footer: a fixed-width block of colour
// with its label centred, matching the web client's equal-column grid.
func FastCell(label string, c lipgloss.Color, width int) string {
	if width <= 0 {
		return ""
	}
	if runewidth.StringWidth(label) > width {
		label = runewidth.Truncate(label, width, "…")
	}
	slack := width - runewidth.StringWidth(label)
	left := slack / 2
	return lipgloss.NewStyle().Background(c).Foreground(Black).Bold(true).
		Render(strings.Repeat(" ", left) + label + strings.Repeat(" ", slack-left))
}

// Cursor highlights the selected row, standing in for the web client's .tt-cur
// outline. A terminal has no outline, so the row is reversed into cyan.
var Cursor = lipgloss.NewStyle().Background(Cyan).Foreground(Black)

var ansiRe = regexp.MustCompile(`\x1b\[[0-9;]*m`)

// Plain strips escape sequences. The cursor row is repainted as a single block
// of colour, so its text has to be recovered from the already-styled line.
func Plain(s string) string { return ansiRe.ReplaceAllString(s, "") }

// PageTitle is the web client's PageHeader h1: cyan, and set in the single size
// step teletext actually had.
var PageTitle = lipgloss.NewStyle().Foreground(Cyan).Bold(true)

// BarRow paints an already-laid-out string as a full-width solid bar, for
// headers that carry something on each side (the web client's .tt-bar with a
// .tt-bar-r element pushed right).
func BarRow(content string, bg lipgloss.Color) string {
	return lipgloss.NewStyle().Background(bg).Foreground(Black).Bold(true).Render(content)
}

// Truncate cuts to a column budget, marking the cut.
func Truncate(s string, max int) string {
	if max <= 0 {
		return ""
	}
	if runewidth.StringWidth(s) <= max {
		return s
	}
	return runewidth.Truncate(s, max, "…")
}
