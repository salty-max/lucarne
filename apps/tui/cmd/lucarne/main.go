// Command lucarne is the terminal client for Lucarne: football fixtures and
// their French broadcaster, as a teletext page.
package main

import (
	"fmt"
	"time"

	"github.com/salty-max/lucarne/apps/tui/internal/render"
)

// Placeholder until the API client and router land: draws one static page so
// the renderer can be seen working. Not the real entry point yet.
func main() {
	s := render.NewScreen()
	demo(s)
	fmt.Print("\x1b[2J")
	fmt.Print(s.Render(termSize()))
	fmt.Print("\x1b[0m\n")
}

func termSize() (int, int) {
	// The real lifecycle work queries the terminal; until then assume a
	// comfortable default so the page has somewhere to centre itself.
	return 80, 30
}

func demo(s *render.Screen) {
	s.Clear(render.White, render.Black)

	// Header: the teletext masthead, page number, date.
	s.Band(0, render.Blue)
	s.Put(1, 0, "LUCARNE", render.Yellow, render.Blue)
	s.Put(24, 0, "100", render.White, render.Blue)
	s.Put(29, 0, time.Now().Format("02 Jan"), render.Cyan, render.Blue)

	row := 2
	for _, comp := range []struct {
		name    string
		colour  render.Color
		matches [][4]string // time, home, away, broadcaster
	}{
		{"LIGUE 1", render.Red, [][4]string{
			{"21:00", "PSG", "MARSEILLE", "beIN SPORTS 1"},
			{"19:00", "LYON", "MONACO", "Ligue 1+"},
		}},
		{"PREMIER LEAGUE", render.Green, [][4]string{
			{"20:45", "ARSENAL", "CHELSEA", "Canal+ Foot"},
		}},
	} {
		s.Band(row, comp.colour)
		s.Put(1, row, render.Upper(comp.name), render.Black, comp.colour)
		row += 2
		for _, m := range comp.matches {
			s.Put(1, row, m[0], render.Cyan, render.Black)
			s.Put(8, row, render.Truncate(render.Upper(m[1]), 12), render.White, render.Black)
			s.Put(21, row, "-", render.White, render.Black)
			s.Put(23, row, render.Truncate(render.Upper(m[2]), 16), render.White, render.Black)
			s.Put(8, row+1, render.Truncate(m[3], 31), render.Yellow, render.Black)
			row += 3
		}
	}

	// FastText bar: the four coloured keys, as on a real teletext set.
	s.Put(0, render.Rows-1, " ", render.White, render.Black)
	for i, k := range []struct {
		label  string
		colour render.Color
	}{
		{"JOUR-", render.Red},
		{"JOUR+", render.Green},
		{"COMPÉT", render.Yellow},
		{"LIVE", render.Cyan},
	} {
		x := 1 + i*10
		s.Put(x, render.Rows-1, "▐", k.colour, render.Black)
		s.Put(x+1, render.Rows-1, k.label, render.Black, k.colour)
	}
}
