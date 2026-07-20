// Command lucarne is the terminal client for Lucarne: football fixtures and
// their French broadcaster, as a teletext page.
//
//	lucarne                                   # against a local `bun run dev`
//	LUCARNE_API=https://lucarne.fr lucarne    # against a deployment
package main

import (
	"context"
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/salty-max/lucarne/apps/tui/internal/ui"
)

func main() {
	// Bubble Tea owns the terminal: alternate screen, raw mode, and restoring
	// both on exit, on signals and on panic.
	p := tea.NewProgram(ui.New(context.Background()), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "lucarne:", err)
		os.Exit(1)
	}
}
