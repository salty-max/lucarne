package render

import (
	"fmt"
	"os"
	"strings"
)

// Color is a teletext colour. Eight of them, full saturation, nothing between —
// the constraint is the aesthetic.
type Color uint8

const (
	Black Color = iota
	Red
	Green
	Yellow
	Blue
	Magenta
	Cyan
	White
)

// rgb holds the CEPT values the web client's cept1 theme uses, so both clients
// render the same red.
var rgb = [8][3]uint8{
	{0, 0, 0},
	{255, 0, 0},
	{0, 255, 0},
	{255, 255, 0},
	{0, 0, 255},
	{255, 0, 255},
	{0, 255, 255},
	{255, 255, 255},
}

// ColorMode decides how much the terminal is trusted with colour.
type ColorMode int

const (
	ColorTrue ColorMode = iota
	ColorANSI
	ColorNone
)

var mode = detectColorMode()

// detectColorMode prefers truecolor because the basic ANSI codes are whatever
// the user's theme decided: a "teletext red" rendering as maroon defeats the
// point. Falls back rather than assuming, and honours NO_COLOR.
func detectColorMode() ColorMode {
	if v, ok := os.LookupEnv("NO_COLOR"); ok && v != "" {
		return ColorNone
	}
	switch os.Getenv("LUCARNE_COLOR") {
	case "ansi":
		return ColorANSI
	case "none":
		return ColorNone
	case "truecolor":
		return ColorTrue
	}
	ct := os.Getenv("COLORTERM")
	if strings.Contains(ct, "truecolor") || strings.Contains(ct, "24bit") {
		return ColorTrue
	}
	if strings.Contains(os.Getenv("TERM"), "256color") {
		return ColorTrue
	}
	return ColorANSI
}

// SetColorMode overrides detection. Tests use it; so could a --color flag.
func SetColorMode(m ColorMode) { mode = m }

// Mode reports the active colour mode.
func Mode() ColorMode { return mode }

const reset = "\x1b[0m"

// FG returns the escape sequence setting the foreground to c.
func FG(c Color) string {
	switch mode {
	case ColorNone:
		return ""
	case ColorANSI:
		// Bright variants: closer to full-intensity teletext than 30-37.
		return fmt.Sprintf("\x1b[%dm", 90+int(c))
	default:
		v := rgb[c]
		return fmt.Sprintf("\x1b[38;2;%d;%d;%dm", v[0], v[1], v[2])
	}
}

// BG returns the escape sequence setting the background to c.
func BG(c Color) string {
	switch mode {
	case ColorNone:
		return ""
	case ColorANSI:
		return fmt.Sprintf("\x1b[%dm", 100+int(c))
	default:
		v := rgb[c]
		return fmt.Sprintf("\x1b[48;2;%d;%d;%dm", v[0], v[1], v[2])
	}
}
