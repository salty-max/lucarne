package render

import "testing"

// Every column on a teletext page is load-bearing: one mis-measured string and
// the whole column below it shifts.

func TestWidth(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want int
	}{
		{"plain ASCII", "MARSEILLE", 9},
		{"precomposed accent", "SAINT-ÉTIENNE", 13},
		// Explicitly decomposed: "E" + U+0301 is two runes rendering in one
		// column. Written as an escape because a literal É is precomposed,
		// which would make this a duplicate of the case above.
		{"combining mark", "ÉTIENNE", 7},
		{"CJK is double width", "東京", 4},
		{"empty", "", 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Width(c.in); got != c.want {
				t.Errorf("Width(%q) = %d, want %d", c.in, got, c.want)
			}
		})
	}
}

func TestCombiningMarkPremise(t *testing.T) {
	// Guards the test above: if this string were precomposed it would be 7
	// runes and the zero-width path would never be exercised.
	s := "ÉTIENNE"
	if got := len([]rune(s)); got != 8 {
		t.Fatalf("expected 8 runes, got %d — the decomposed premise is broken", got)
	}
}

func TestTruncate(t *testing.T) {
	if got := Truncate("PSG", 10); got != "PSG" {
		t.Errorf("short string was altered: %q", got)
	}
	if got := Truncate("MANCHESTER CITY", 10); got != "MANCHESTER" {
		t.Errorf("Truncate = %q", got)
	}
	// A budget of 3 cannot fit a second double-width glyph, so it stops at 2.
	if got := Width(Truncate("東京都", 3)); got != 2 {
		t.Errorf("wide truncation overshot: width %d", got)
	}
	for _, max := range []int{0, -2} {
		if got := Truncate("PSG", max); got != "" {
			t.Errorf("Truncate(_, %d) = %q, want empty", max, got)
		}
	}
}

func TestEllipsis(t *testing.T) {
	got := Ellipsis("MANCHESTER CITY", 10)
	if Width(got) != 10 {
		t.Errorf("Ellipsis width = %d, want 10 (%q)", Width(got), got)
	}
	if got == "MANCHESTER" {
		t.Error("truncation was not marked")
	}
	if got := Ellipsis("PSG", 10); got != "PSG" {
		t.Errorf("marked a string that fits: %q", got)
	}
}

func TestPadding(t *testing.T) {
	if got := PadEnd("PSG", 6); got != "PSG   " {
		t.Errorf("PadEnd = %q", got)
	}
	if got := PadStart("2", 3); got != "  2" {
		t.Errorf("PadStart = %q", got)
	}
	// Accented names must occupy the same column count as unaccented ones.
	if got := Width(PadEnd("NÎMES", 10)); got != 10 {
		t.Errorf("accented pad width = %d, want 10", got)
	}
	if got := Width(PadEnd("MANCHESTER CITY", 8)); got != 8 {
		t.Errorf("pad exceeded its budget: %d", got)
	}
	if got := Centre("AB", 5); got != " AB  " {
		t.Errorf("Centre = %q, want left bias", got)
	}
}

func TestUpper(t *testing.T) {
	if got := Upper("Nîmes"); got != "NÎMES" {
		t.Errorf("Upper = %q", got)
	}
	if got := Width(Upper("Nîmes")); got != 5 {
		t.Errorf("uppercasing changed the width: %d", got)
	}
}
