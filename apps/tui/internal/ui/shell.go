package ui

import (
	"strconv"
	"strings"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/salty-max/lucarne/apps/tui/internal/teletext"
	"github.com/salty-max/lucarne/apps/tui/internal/theme"
)

// A line is one rendered row of a page. Lines with an open function are
// selectable: the cursor walks them and Enter activates one. This mirrors the
// web client, which moves a highlight through the page's [data-nav] items and
// clicks the highlighted one — no focus, no tab order.
type line struct {
	text string
	open func(m *Model) tea.Cmd
}

func plainLine(s string) line { return line{text: s} }

// page is one screen. Pages own their data and their lines; the shell owns the
// cursor, the scrolling and the chrome.
type page interface {
	Number() teletext.Page
	Header() (title, subtitle string)
	// Lines renders the page body at the given width.
	Lines(m *Model, width int) []line
	// Update handles page-specific messages and keys. Returning true means the
	// key was consumed and the shell should not treat it as navigation.
	Update(m *Model, msg tea.Msg) (tea.Cmd, bool)
}

// serviceLine is the top row: page number, wordmark, live count, the number
// being typed, the date and the clock. Ported from the web client's .tt-service.
func (m Model) serviceLine(width int) string {
	num := theme.Tag(string(m.current().Number()), theme.Yellow)
	mark := theme.MastheadDim.Render("LUCARNE")

	right := m.clock
	if m.date != "" {
		right = m.date + "  " + m.clock
	}

	// The typed page number, echoed with a block cursor as on a real set.
	entry := ""
	if m.entry != "" {
		entry = theme.EntryStyle.Render(m.entry + "▌")
	}

	live := ""
	if n := m.liveCount(); n > 0 {
		live = "  " + theme.Alert.Render("● "+strconv.Itoa(n))
	}

	left := " " + num + " " + mark + live
	rightR := theme.Muted.Render(right) + " "
	gap := max(width-theme.Rendered(left)-theme.Rendered(rightR)-theme.Rendered(entry), 1)
	return left + strings.Repeat(" ", gap) + entry + rightR
}

// fastText renders the two footer rows, four equal cells each, exactly as the
// web client's .tt-fast grid does.
func fastRow(keys []teletext.Key, width int) string {
	if len(keys) == 0 {
		return ""
	}
	cell := width / len(keys)

	// The page number is dropped when a cell is too narrow to hold it and the
	// label, mirroring the web client, which hides the number below its `sm`
	// breakpoint. A number is useless if it costs you the word beside it.
	withNumbers := true
	for _, k := range keys {
		if theme.Width(string(k.No)+" "+k.Label) > cell {
			withNumbers = false
			break
		}
	}

	var b strings.Builder
	for i, k := range keys {
		w := cell
		if i == len(keys)-1 {
			w = width - cell*(len(keys)-1) // absorb the rounding in the last cell
		}
		label := theme.Upper(k.Label)
		if withNumbers {
			label = string(k.No) + " " + label
		}
		b.WriteString(theme.FastCell(label, theme.ByName(string(k.Colour)), w))
	}
	return b.String()
}

// kbdHint is the instruction line under the footer. The web client spells the
// same four things out; a terminal user has no other way to discover that
// typing three digits jumps to a page.
func kbdHint() string {
	k := theme.Key
	return theme.Muted.Render(" ") +
		k("###") + theme.Muted.Render(" page  ") +
		k("↑") + k("↓") + theme.Muted.Render(" move  ") +
		k("↵") + theme.Muted.Render(" open  ") +
		k("R") + k("G") + k("Y") + k("C") + theme.Muted.Render(" sections  ") +
		k("⌫") + theme.Muted.Render(" back  ") +
		k("q") + theme.Muted.Render(" quit")
}

// chromeHeight is what the shell takes: service line, the two footer rows and
// the hint. The rest belongs to the page.
const chromeHeight = 4
