package render

import (
	"fmt"
	"strings"
)

// A teletext page is 40 columns by 24 rows. Holding to that exactly — rather
// than filling whatever terminal it lands in — is the point: the constraint is
// what makes the layout read as teletext. Wider terminals get it centred.
const (
	Cols = 40
	Rows = 24
)

type cell struct {
	ch rune
	fg Color
	bg Color
}

var blank = cell{ch: ' ', fg: White, bg: Black}

// Screen is a cell grid that paints itself to ANSI, emitting only what moved
// since the last frame.
type Screen struct {
	cells []cell
	// prev is the last painted frame. nil forces a full repaint, used on the
	// first draw and after a resize.
	prev []cell
}

// NewScreen returns a blank page.
func NewScreen() *Screen {
	s := &Screen{cells: make([]cell, Cols*Rows)}
	s.Clear(White, Black)
	return s
}

// Clear resets every cell to a space in the given colours.
func (s *Screen) Clear(fg, bg Color) {
	for i := range s.cells {
		s.cells[i] = cell{ch: ' ', fg: fg, bg: bg}
	}
}

// Put writes text starting at (x, y). Anything past the right edge is dropped
// rather than wrapping: a string one column too long should lose its tail, not
// reappear on the next line.
func (s *Screen) Put(x, y int, text string, fg, bg Color) {
	if y < 0 || y >= Rows || x >= Cols {
		return
	}
	cx := x
	for _, r := range Truncate(text, Cols-x) {
		if cx >= Cols {
			break
		}
		if cx >= 0 {
			s.cells[y*Cols+cx] = cell{ch: r, fg: fg, bg: bg}
		}
		cx += runeCols(r)
	}
}

func runeCols(r rune) int {
	w := Width(string(r))
	if w < 1 {
		return 1 // a zero-width mark still advances no column of its own
	}
	return w
}

// Fill paints a rectangle, clipped to the grid.
func (s *Screen) Fill(x, y, w, h int, bg Color) {
	for row := y; row < y+h; row++ {
		if row < 0 || row >= Rows {
			continue
		}
		for col := x; col < x+w; col++ {
			if col < 0 || col >= Cols {
				continue
			}
			s.cells[row*Cols+col] = cell{ch: ' ', fg: bg, bg: bg}
		}
	}
}

// Band paints a full-width solid row — the teletext section header.
func (s *Screen) Band(y int, bg Color) { s.Fill(0, y, Cols, 1, bg) }

// Invalidate forces the next Render to repaint everything.
func (s *Screen) Invalidate() { s.prev = nil }

// Render returns the ANSI needed to bring the terminal from the last frame to
// this one. Only changed runs are emitted, so a live score ticking over
// repaints two cells rather than nine hundred — without that the page tears
// visibly on every poll.
func (s *Screen) Render(termCols, termRows int) string {
	offX := max(0, (termCols-Cols)/2)
	offY := max(0, (termRows-Rows)/2)
	full := s.prev == nil

	var b strings.Builder
	for y := 0; y < Rows; y++ {
		x := 0
		for x < Cols {
			i := y*Cols + x
			if !full && s.prev[i] == s.cells[i] {
				x++
				continue
			}

			// Start of a changed run: position once, then walk it.
			fmt.Fprintf(&b, "\x1b[%d;%dH", offY+y+1, offX+x+1)
			var curFG, curBG Color
			first := true
			for x < Cols {
				j := y*Cols + x
				if !full && s.prev[j] == s.cells[j] {
					break
				}
				c := s.cells[j]
				if first || c.fg != curFG || c.bg != curBG {
					b.WriteString(FG(c.fg))
					b.WriteString(BG(c.bg))
					curFG, curBG = c.fg, c.bg
					first = false
				}
				b.WriteRune(c.ch)
				x++
			}
			b.WriteString(reset)
		}
	}

	s.prev = append(s.prev[:0:0], s.cells...)
	return b.String()
}

// Text renders the grid as plain text, for tests and snapshots.
func (s *Screen) Text() string {
	lines := make([]string, 0, Rows)
	for y := 0; y < Rows; y++ {
		var line strings.Builder
		for x := 0; x < Cols; x++ {
			line.WriteRune(s.cells[y*Cols+x].ch)
		}
		lines = append(lines, strings.TrimRight(line.String(), " "))
	}
	return strings.Join(lines, "\n")
}

// At exposes one cell, for tests.
func (s *Screen) At(x, y int) (ch rune, fg, bg Color) {
	c := s.cells[y*Cols+x]
	return c.ch, c.fg, c.bg
}
