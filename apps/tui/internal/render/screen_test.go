package render

import (
	"strings"
	"testing"
)

// The tests pin a 40x24 page so the expectations stay readable; the grid itself
// is sized by the caller now.
const (
	testCols = 40
	testRows = 24
)

func TestPut(t *testing.T) {
	s := NewScreen(testCols, testRows)
	s.Put(2, 1, "PSG", White, Black)
	if got := strings.Split(s.Text(), "\n")[1]; got != "  PSG" {
		t.Errorf("row 1 = %q", got)
	}
}

func TestPutClipsInsteadOfWrapping(t *testing.T) {
	s := NewScreen(testCols, testRows)
	s.Put(testCols-3, 0, "MARSEILLE", White, Black)
	lines := strings.Split(s.Text(), "\n")
	if got := Width(lines[0]); got != testCols {
		t.Errorf("row 0 width = %d, want %d", got, testCols)
	}
	if lines[1] != "" {
		t.Errorf("text bled onto the next row: %q", lines[1])
	}
}

func TestPutOutsideGrid(t *testing.T) {
	s := NewScreen(testCols, testRows)
	s.Put(0, testRows+5, "OFF", White, Black)
	s.Put(0, -1, "OFF", White, Black)
	if got := strings.ReplaceAll(s.Text(), "\n", ""); got != "" {
		t.Errorf("grid should be empty, got %q", got)
	}
}

func TestPutRecordsColours(t *testing.T) {
	s := NewScreen(testCols, testRows)
	s.Put(0, 0, "X", Yellow, Blue)
	ch, fg, bg := s.At(0, 0)
	if ch != 'X' || fg != Yellow || bg != Blue {
		t.Errorf("cell = %q/%v/%v", ch, fg, bg)
	}
}

func TestRenderFirstFrameIsFull(t *testing.T) {
	s := NewScreen(testCols, testRows)
	s.Put(0, 0, "LUCARNE", White, Black)
	if out := s.Render(80, 30); !strings.Contains(out, "LUCARNE") {
		t.Error("first frame did not paint the text")
	}
}

// The live page repaints on every poll. If an unchanged frame still emitted
// every cell, it would tear visibly each time.
func TestRenderEmitsNothingWhenUnchanged(t *testing.T) {
	s := NewScreen(testCols, testRows)
	s.Put(0, 0, "LUCARNE", White, Black)
	s.Render(80, 30)
	if out := s.Render(80, 30); out != "" {
		t.Errorf("unchanged frame emitted %d bytes", len(out))
	}
}

func TestRenderEmitsOnlyChangedCells(t *testing.T) {
	s := NewScreen(testCols, testRows)
	s.Put(0, 0, "SCORE 0-0", White, Black)
	s.Render(80, 30)
	s.Put(6, 0, "1", White, Black)
	out := s.Render(80, 30)
	if !strings.Contains(out, "1") {
		t.Error("changed cell was not emitted")
	}
	if strings.Contains(out, "SCORE") {
		t.Error("unchanged cells were repainted")
	}
}

func TestRenderAfterInvalidate(t *testing.T) {
	s := NewScreen(testCols, testRows)
	s.Put(0, 0, "LUCARNE", White, Black)
	s.Render(80, 30)
	s.Invalidate()
	if out := s.Render(80, 30); !strings.Contains(out, "LUCARNE") {
		t.Error("invalidate did not force a repaint")
	}
}

func TestRenderCentresInWiderTerminal(t *testing.T) {
	s := NewScreen(testCols, testRows)
	s.Put(0, 0, "X", White, Black)
	// (100-40)/2 = 30 columns, (40-24)/2 = 8 rows, both 1-indexed in ANSI.
	if out := s.Render(100, 40); !strings.Contains(out, "\x1b[9;31H") {
		t.Error("page was not centred")
	}
}

func TestRenderDoesNotShiftWhenTerminalIsSmaller(t *testing.T) {
	s := NewScreen(testCols, testRows)
	s.Put(0, 0, "X", White, Black)
	if out := s.Render(20, 10); !strings.Contains(out, "\x1b[1;1H") {
		t.Error("page shifted off the origin in a narrow terminal")
	}
}

func TestBandSpansFullWidth(t *testing.T) {
	s := NewScreen(testCols, testRows)
	s.Band(3, Red)
	for x := 0; x < testCols; x++ {
		if _, _, bg := s.At(x, 3); bg != Red {
			t.Fatalf("cell %d not filled", x)
		}
	}
}

func TestFillClipsToGrid(t *testing.T) {
	s := NewScreen(testCols, testRows)
	s.Fill(-5, -5, testCols+20, testRows+20, Green) // must not panic
	if _, _, bg := s.At(0, 0); bg != Green {
		t.Error("top-left not filled")
	}
	if _, _, bg := s.At(testCols-1, testRows-1); bg != Green {
		t.Error("bottom-right not filled")
	}
}
