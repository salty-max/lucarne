package tui

import (
	"os"
	"unicode/utf8"
)

// KeyType distinguishes the keys the pages care about. Anything else arrives as
// KeyRune and is matched on its rune.
type KeyType int

const (
	KeyRune KeyType = iota
	KeyUp
	KeyDown
	KeyLeft
	KeyRight
	KeyEnter
	KeyEsc
	KeyBackspace
	KeyCtrlC
	KeyPageUp
	KeyPageDown
)

// Key is one decoded keypress.
type Key struct {
	Type KeyType
	Rune rune
}

// ParseKeys decodes as many keys as it can from buf and reports how many bytes
// it consumed. A trailing partial escape sequence or partial UTF-8 rune is left
// unconsumed so the caller can append the next read and try again — otherwise a
// sequence split across two reads would be decoded as garbage.
func ParseKeys(buf []byte) (keys []Key, consumed int) {
	i := 0
	for i < len(buf) {
		b := buf[i]

		switch {
		case b == 0x1b:
			k, n, ok := parseEscape(buf[i:])
			if !ok {
				return keys, i // incomplete; wait for more bytes
			}
			keys = append(keys, k)
			i += n

		case b == 0x03:
			keys = append(keys, Key{Type: KeyCtrlC})
			i++

		case b == '\r' || b == '\n':
			keys = append(keys, Key{Type: KeyEnter})
			i++

		case b == 0x7f || b == 0x08:
			keys = append(keys, Key{Type: KeyBackspace})
			i++

		default:
			r, size := utf8.DecodeRune(buf[i:])
			if r == utf8.RuneError && size <= 1 {
				if !utf8.FullRune(buf[i:]) {
					return keys, i // partial rune; wait for the rest
				}
				i++ // genuinely invalid byte: skip it
				continue
			}
			keys = append(keys, Key{Type: KeyRune, Rune: r})
			i += size
		}
	}
	return keys, i
}

// parseEscape decodes one escape sequence from the front of buf.
//
// A lone ESC is reported as KeyEsc only when it is the whole buffer: mid-buffer
// it is far more likely to be the start of a sequence whose tail has not
// arrived yet, and guessing wrong turns an arrow key into a quit.
func parseEscape(buf []byte) (Key, int, bool) {
	if len(buf) == 1 {
		return Key{Type: KeyEsc}, 1, true
	}
	if buf[1] != '[' && buf[1] != 'O' {
		// ESC followed by an ordinary key (Alt-x); treat the ESC alone.
		return Key{Type: KeyEsc}, 1, true
	}
	if len(buf) < 3 {
		return Key{}, 0, false
	}

	switch buf[2] {
	case 'A':
		return Key{Type: KeyUp}, 3, true
	case 'B':
		return Key{Type: KeyDown}, 3, true
	case 'C':
		return Key{Type: KeyRight}, 3, true
	case 'D':
		return Key{Type: KeyLeft}, 3, true
	case '5', '6':
		if len(buf) < 4 {
			return Key{}, 0, false
		}
		if buf[3] == '~' {
			if buf[2] == '5' {
				return Key{Type: KeyPageUp}, 4, true
			}
			return Key{Type: KeyPageDown}, 4, true
		}
	}

	// Unrecognised CSI: swallow up to its final byte so it cannot be mistaken
	// for printable input.
	for j := 2; j < len(buf); j++ {
		if buf[j] >= 0x40 && buf[j] <= 0x7e {
			return Key{Type: KeyEsc}, j + 1, true
		}
	}
	return Key{}, 0, false
}

// Keys streams decoded keypresses. The channel closes when stdin ends.
func (t *Terminal) Keys() <-chan Key {
	out := make(chan Key, 16)
	go func() {
		defer close(out)
		var pending []byte
		buf := make([]byte, 256)
		for {
			n, err := os.Stdin.Read(buf)
			if n > 0 {
				pending = append(pending, buf[:n]...)
				keys, consumed := ParseKeys(pending)
				pending = pending[consumed:]
				for _, k := range keys {
					out <- k
				}
			}
			if err != nil {
				return
			}
		}
	}()
	return out
}
