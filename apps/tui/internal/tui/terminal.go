// Package tui owns the terminal itself: putting it into a state where a
// teletext page can be drawn, and — the part that actually matters — putting it
// back afterwards no matter how the program ends.
package tui

import (
	"bufio"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"golang.org/x/term"
)

const (
	altScreenOn  = "\x1b[?1049h"
	altScreenOff = "\x1b[?1049l"
	cursorHide   = "\x1b[?25l"
	cursorShow   = "\x1b[?25h"
	clearScreen  = "\x1b[2J"
)

// Terminal is the raw-mode alternate screen the page is drawn on.
type Terminal struct {
	fd       int
	oldState *term.State
	out      *bufio.Writer
	closeOne sync.Once

	// Resize delivers a signal whenever the window changes. Buffered and
	// dropped-on-full: a burst of drags should coalesce into one repaint.
	Resize chan struct{}
	sigs   chan os.Signal
}

// Open switches to the alternate screen in raw mode.
//
// The caller MUST arrange for Close to run — including on panic — or the user
// is left with a terminal that echoes nothing and shows no cursor. Restore is
// also wired to SIGINT/SIGTERM here, because a defer alone does not survive a
// signal.
func Open() (*Terminal, error) {
	fd := int(os.Stdout.Fd())
	state, err := term.MakeRaw(int(os.Stdin.Fd()))
	if err != nil {
		return nil, err
	}

	t := &Terminal{
		fd:       fd,
		oldState: state,
		out:      bufio.NewWriterSize(os.Stdout, 1<<16),
		Resize:   make(chan struct{}, 1),
		sigs:     make(chan os.Signal, 4),
	}

	t.WriteString(altScreenOn + cursorHide + clearScreen)
	t.Flush()

	signal.Notify(t.sigs, syscall.SIGWINCH, syscall.SIGINT, syscall.SIGTERM)
	go t.watch()

	return t, nil
}

func (t *Terminal) watch() {
	for s := range t.sigs {
		switch s {
		case syscall.SIGWINCH:
			select {
			case t.Resize <- struct{}{}:
			default: // a repaint is already pending; dropping is correct
			}
		case syscall.SIGINT, syscall.SIGTERM:
			t.Close()
			os.Exit(0)
		}
	}
}

// Close restores the terminal. Safe to call more than once, which matters
// because both the deferred call and the signal handler will try.
func (t *Terminal) Close() {
	t.closeOne.Do(func() {
		signal.Stop(t.sigs)
		t.WriteString(cursorShow + altScreenOff)
		t.Flush()
		if t.oldState != nil {
			_ = term.Restore(int(os.Stdin.Fd()), t.oldState)
		}
	})
}

// Size reports the usable terminal size, falling back to a sane default when
// stdout is not a tty (piped output, CI).
func (t *Terminal) Size() (cols, rows int) {
	c, r, err := term.GetSize(t.fd)
	if err != nil || c <= 0 || r <= 0 {
		return 80, 24
	}
	return c, r
}

// WriteString buffers output; nothing reaches the terminal until Flush. A page
// is painted as one write so it cannot be seen half-drawn.
func (t *Terminal) WriteString(s string) { _, _ = t.out.WriteString(s) }

// Flush pushes the buffered frame to the terminal.
func (t *Terminal) Flush() { _ = t.out.Flush() }
