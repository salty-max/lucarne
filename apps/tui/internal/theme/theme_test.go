package theme

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// Lipgloss makes a generic Charm-looking app the path of least resistance:
// rounded borders, soft padding, gradients. Teletext is none of those. This
// guards the identity mechanically, because style drift is invisible in review
// — each individual RoundedBorder() looks reasonable.
func TestNoNonTeletextStyling(t *testing.T) {
	src, err := os.ReadFile("theme.go")
	if err != nil {
		t.Fatal(err)
	}
	code := stripComments(string(src))

	banned := map[string]string{
		"RoundedBorder":  "teletext has square corners",
		"DoubleBorder":   "teletext has no borders",
		"ThickBorder":    "teletext has no borders",
		"NormalBorder":   "teletext has no borders",
		"BorderStyle":    "teletext has no borders",
		"Faint":          "teletext has no dim attribute; use a quieter colour",
		"Italic":         "the teletext character set has no italics",
		"Underline":      "teletext underlines nothing",
		"AdaptiveColor":  "the palette is fixed, not theme-dependent",
		"CompleteColor":  "the palette is the eight CEPT colours",
		"lipgloss.Color": "", // allowed; checked separately below
	}
	for token, why := range banned {
		if why == "" {
			continue
		}
		if strings.Contains(code, token) {
			t.Errorf("%s used in theme.go — %s", token, why)
		}
	}
}

// Every colour must come from the CEPT palette. A stray hex would be invisible
// on screen but would break the kinship with the web client.
func TestOnlyPaletteColours(t *testing.T) {
	src, err := os.ReadFile("theme.go")
	if err != nil {
		t.Fatal(err)
	}
	allowed := map[string]bool{
		"#000000": true, "#ff0000": true, "#00ff00": true, "#ffff00": true,
		"#0000ff": true, "#ff00ff": true, "#00ffff": true, "#ffffff": true,
	}
	for _, m := range regexp.MustCompile(`#[0-9a-fA-F]{3,8}`).FindAllString(string(src), -1) {
		if !allowed[strings.ToLower(m)] {
			t.Errorf("colour %s is outside the CEPT palette", m)
		}
	}
}

func TestBandFillsTheWidth(t *testing.T) {
	// A band that stops at its label reads as a tag, not as a section rule.
	got := Band("ligue 1", Red, 40)
	if w := Width(stripANSI(got)); w != 40 {
		t.Errorf("band is %d columns, want 40: %q", w, stripANSI(got))
	}
	if !strings.Contains(stripANSI(got), "LIGUE 1") {
		t.Errorf("band lost its label: %q", stripANSI(got))
	}
}

func TestPadIsExact(t *testing.T) {
	cases := []struct {
		in string
		w  int
	}{
		{"PSG", 10},
		{"NÎMES", 10},          // accents must not shift the column
		{"MANCHESTER CITY", 8}, // truncation still fills exactly
		{"東京", 5},              // double-width runes
		{"", 4},
	}
	for _, c := range cases {
		if got := Width(Pad(c.in, c.w)); got != c.w {
			t.Errorf("Pad(%q, %d) is %d columns", c.in, c.w, got)
		}
		if got := Width(PadLeft(c.in, c.w)); got != c.w {
			t.Errorf("PadLeft(%q, %d) is %d columns", c.in, c.w, got)
		}
	}
}

func TestPadMarksTruncation(t *testing.T) {
	// A silently cut club name reads as a different club.
	if got := Pad("MANCHESTER CITY", 8); !strings.Contains(got, "…") {
		t.Errorf("truncation not marked: %q", got)
	}
}

var ansi = regexp.MustCompile(`\x1b\[[0-9;]*m`)

func stripANSI(s string) string { return ansi.ReplaceAllString(s, "") }

// stripComments removes the file's own prose so the banned-token scan does not
// trip over the comment explaining what is banned.
func stripComments(s string) string {
	var b strings.Builder
	for _, line := range strings.Split(s, "\n") {
		if t := strings.TrimSpace(line); strings.HasPrefix(t, "//") {
			continue
		}
		b.WriteString(line)
		b.WriteString("\n")
	}
	return b.String()
}
