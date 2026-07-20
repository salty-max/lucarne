package render

import (
	"fmt"
	"strings"
)

// A teletext page was 40x24. That grid is kept as the floor — the layout is
// designed against it and never breaks below it — but the page grows into the
// window above that, because holding to 40 columns costs real information: a
// quarter of European club names do not fit in the resulting name column.
//
// MaxCols stops the page becoming a single sprawling line on an ultrawide
// display, where the eye has to travel too far between kickoff and broadcaster.
const (
	MinCols = 40
	MaxCols = 80
	MinRows = 12
)

// FitCols clamps a terminal width to the page's usable range.
func FitCols(termCols int) int {
	return min(max(termCols, MinCols), MaxCols)
}

// FitRows clamps a terminal height. There is no upper bound: more rows just
// means less scrolling.
func FitRows(termRows int) int { return max(termRows, MinRows) }

type cell struct {
	ch rune
	fg Color
	bg Color
}

// Screen is a cell grid that paints itself to ANSI, emitting only what moved
// since the last frame.
type Screen struct {
	cols, rows int
	cells      []cell
	// prev is the last painted frame. nil forces a full repaint, used on the
	// first draw and after a resize.
	prev []cell
}

// NewScreen returns a blank page of the given size.
func NewScreen(cols, rows int) *Screen {
	s := &Screen{cols: max(cols, 1), rows: max(rows, 1)}
	s.cells = make([]cell, s.cols*s.rows)
	s.Clear(White, Black)
	return s
}

// Cols is the page width in columns.
func (s *Screen) Cols() int { return s.cols }

// Rows is the page height in rows.
func (s *Screen) Rows() int { return s.rows }

// Resize reallocates the grid. The previous frame is discarded: at a new size
// it describes different cells, so diffing against it would leave debris.
func (s *Screen) Resize(cols, rows int) {
	cols, rows = max(cols, 1), max(rows, 1)
	if cols == s.cols && rows == s.rows {
		return
	}
	s.cols, s.rows = cols, rows
	s.cells = make([]cell, cols*rows)
	s.prev = nil
	s.Clear(White, Black)
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
	if y < 0 || y >= s.rows || x >= s.cols {
		return
	}
	cx := x
	for _, r := range Truncate(text, s.cols-x) {
		if cx >= s.cols {
			break
		}
		if cx >= 0 {
			s.cells[y*s.cols+cx] = cell{ch: r, fg: fg, bg: bg}
		}
		cx += runeCols(r)
	}
}

func runeCols(r rune) int {
	if w := Width(string(r)); w > 1 {
		return w
	}
	return 1
}

// Fill paints a rectangle, clipped to the grid.
func (s *Screen) Fill(x, y, w, h int, bg Color) {
	for row := y; row < y+h; row++ {
		if row < 0 || row >= s.rows {
			continue
		}
		for col := x; col < x+w; col++ {
			if col < 0 || col >= s.cols {
				continue
			}
			s.cells[row*s.cols+col] = cell{ch: ' ', fg: bg, bg: bg}
		}
	}
}

// Band paints a full-width solid row — the teletext section header.
func (s *Screen) Band(y int, bg Color) { s.Fill(0, y, s.cols, 1, bg) }

// Invalidate forces the next Render to repaint everything.
func (s *Screen) Invalidate() { s.prev = nil }

// Render returns the ANSI needed to bring the terminal from the last frame to
// this one. Only changed runs are emitted, so a live score ticking over
// repaints two cells rather than the whole page — without that it tears
// visibly on every poll.
func (s *Screen) Render(termCols, termRows int) string {
	offX := max(0, (termCols-s.cols)/2)
	offY := max(0, (termRows-s.rows)/2)
	full := s.prev == nil

	var b strings.Builder
	for y := 0; y < s.rows; y++ {
		x := 0
		for x < s.cols {
			i := y*s.cols + x
			if !full && s.prev[i] == s.cells[i] {
				x++
				continue
			}

			// Start of a changed run: position once, then walk it.
			fmt.Fprintf(&b, "\x1b[%d;%dH", offY+y+1, offX+x+1)
			var curFG, curBG Color
			first := true
			for x < s.cols {
				j := y*s.cols + x
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
	lines := make([]string, 0, s.rows)
	for y := 0; y < s.rows; y++ {
		var line strings.Builder
		for x := 0; x < s.cols; x++ {
			line.WriteRune(s.cells[y*s.cols+x].ch)
		}
		lines = append(lines, strings.TrimRight(line.String(), " "))
	}
	return strings.Join(lines, "\n")
}

// At exposes one cell, for tests.
func (s *Screen) At(x, y int) (ch rune, fg, bg Color) {
	c := s.cells[y*s.cols+x]
	return c.ch, c.fg, c.bg
}
