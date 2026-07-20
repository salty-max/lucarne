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

	"github.com/salty-max/lucarne/apps/tui/internal/app"
	"github.com/salty-max/lucarne/apps/tui/internal/tui"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "lucarne:", err)
		os.Exit(1)
	}
}

func run() (err error) {
	term, openErr := tui.Open()
	if openErr != nil {
		return openErr
	}

	// The terminal must be restored whatever happens. A panic here would
	// otherwise leave the user in raw mode on the alternate screen — no echo,
	// no cursor, no obvious way back — so re-panic only after restoring.
	defer func() {
		if r := recover(); r != nil {
			term.Close()
			panic(r)
		}
		term.Close()
	}()

	return app.New(term).Run(context.Background())
}
