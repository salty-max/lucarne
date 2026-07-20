package tui

import "testing"

func TestParsePlainRunes(t *testing.T) {
	keys, n := ParseKeys([]byte("100"))
	if n != 3 || len(keys) != 3 {
		t.Fatalf("got %d keys, consumed %d", len(keys), n)
	}
	for i, want := range []rune{'1', '0', '0'} {
		if keys[i].Type != KeyRune || keys[i].Rune != want {
			t.Errorf("key %d = %+v", i, keys[i])
		}
	}
}

func TestParseArrows(t *testing.T) {
	cases := map[string]KeyType{
		"\x1b[A": KeyUp,
		"\x1b[B": KeyDown,
		"\x1b[C": KeyRight,
		"\x1b[D": KeyLeft,
	}
	for seq, want := range cases {
		keys, n := ParseKeys([]byte(seq))
		if len(keys) != 1 || keys[0].Type != want || n != 3 {
			t.Errorf("%q decoded as %+v (consumed %d)", seq, keys, n)
		}
	}
}

func TestParsePageKeys(t *testing.T) {
	keys, n := ParseKeys([]byte("\x1b[5~\x1b[6~"))
	if len(keys) != 2 || keys[0].Type != KeyPageUp || keys[1].Type != KeyPageDown || n != 8 {
		t.Errorf("got %+v consumed %d", keys, n)
	}
}

func TestParseControlKeys(t *testing.T) {
	keys, _ := ParseKeys([]byte{0x03, '\r', 0x7f})
	if len(keys) != 3 ||
		keys[0].Type != KeyCtrlC || keys[1].Type != KeyEnter || keys[2].Type != KeyBackspace {
		t.Errorf("got %+v", keys)
	}
}

// An arrow key routinely arrives split across two reads. If the partial
// sequence were decoded eagerly, the leading ESC would read as "quit" and the
// remaining "[A" would be typed into the page.
func TestPartialEscapeIsNotConsumed(t *testing.T) {
	keys, n := ParseKeys([]byte("\x1b["))
	if len(keys) != 0 {
		t.Errorf("partial sequence decoded as %+v", keys)
	}
	if n != 0 {
		t.Errorf("partial sequence consumed %d bytes, want 0", n)
	}

	// Once the tail arrives, it decodes as one key.
	keys, n = ParseKeys([]byte("\x1b[A"))
	if len(keys) != 1 || keys[0].Type != KeyUp || n != 3 {
		t.Errorf("reassembled sequence = %+v consumed %d", keys, n)
	}
}

func TestLoneEscapeIsEscapeOnlyWhenAlone(t *testing.T) {
	keys, n := ParseKeys([]byte{0x1b})
	if len(keys) != 1 || keys[0].Type != KeyEsc || n != 1 {
		t.Errorf("lone ESC = %+v consumed %d", keys, n)
	}
}

func TestParseMultibyteRune(t *testing.T) {
	keys, n := ParseKeys([]byte("é"))
	if len(keys) != 1 || keys[0].Rune != 'é' || n != 2 {
		t.Errorf("got %+v consumed %d", keys, n)
	}
}

// A multi-byte rune can also straddle a read boundary.
func TestPartialRuneIsNotConsumed(t *testing.T) {
	full := []byte("é")
	keys, n := ParseKeys(full[:1])
	if len(keys) != 0 || n != 0 {
		t.Errorf("partial rune decoded as %+v consumed %d", keys, n)
	}
}

func TestUnknownSequenceIsSwallowed(t *testing.T) {
	// An unrecognised CSI must not leak its bytes into the page as text.
	keys, n := ParseKeys([]byte("\x1b[200~X"))
	if n != 7 {
		t.Fatalf("consumed %d, want the whole sequence plus X", n)
	}
	last := keys[len(keys)-1]
	if last.Type != KeyRune || last.Rune != 'X' {
		t.Errorf("expected the trailing X to survive, got %+v", keys)
	}
	for _, k := range keys[:len(keys)-1] {
		if k.Type == KeyRune {
			t.Errorf("sequence bytes leaked as text: %+v", k)
		}
	}
}
