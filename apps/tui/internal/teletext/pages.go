// Package teletext holds the page numbering and the FastText bar.
//
// This is a direct port of apps/web/src/lib/teletext.ts. The two clients must
// agree: a user who learns that 400 is the competitions index on the web should
// find the same thing in the terminal, and the page number is the only
// navigation aid teletext ever had.
package teletext

import (
	"strconv"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
)

// Page identifies a screen. Static sections get round numbers; each tracked
// competition gets 410, 411, … so it is reachable by typing its number.
type Page string

const (
	PageToday        Page = "100"
	PageFavorites    Page = "200"
	PageCalendar     Page = "300"
	PageCompetitions Page = "400"
	PageRadar        Page = "500"
	PageBroadcasters Page = "600"
	PageSettings     Page = "700"
	PageLogs         Page = "800"
	PageMatch        Page = "900" // 500 is taken by RADAR
)

// CompBase is the first competition page number; index 0 is 410.
const CompBase = 410

// Colour names the eight teletext colours the bars are painted in. The theme
// package maps them to actual colours; keeping them symbolic here means the
// navigation table stays free of styling.
type Colour string

const (
	Red     Colour = "red"
	Green   Colour = "green"
	Yellow  Colour = "yellow"
	Blue    Colour = "blue"
	Magenta Colour = "magenta"
	Cyan    Colour = "cyan"
	White   Colour = "white"
)

// Key is one entry in a FastText bar.
type Key struct {
	Key    string // the keyboard shortcut, empty for the secondary row
	No     Page
	Label  string
	Colour Colour
}

// FastText is the four colour keys, matching the web client's row exactly.
var FastText = []Key{
	{Key: "r", No: PageToday, Label: "Live", Colour: Red},
	{Key: "g", No: PageCalendar, Label: "Calendar", Colour: Green},
	{Key: "y", No: PageCompetitions, Label: "Competitions", Colour: Yellow},
	{Key: "c", No: PageBroadcasters, Label: "Broadcasters", Colour: Cyan},
}

// More is the secondary row: personal and utility pages, reachable by number
// rather than by colour key.
var More = []Key{
	{No: PageFavorites, Label: "My teams", Colour: Blue},
	{No: PageRadar, Label: "Radar", Colour: Cyan},
	{No: PageSettings, Label: "Settings", Colour: Magenta},
	{No: PageLogs, Label: "Logs", Colour: White},
}

// CompPageNo is the page number for the nth tracked competition.
func CompPageNo(index int) Page {
	return Page(strconv.Itoa(CompBase + index))
}

// Resolve maps a typed three-digit number to a page, reporting whether it is
// assigned. An unassigned number must do nothing rather than guess: on a real
// set, typing a dead page left you where you were.
func Resolve(no string, comps []api.CompetitionInfo) (Page, string, bool) {
	switch Page(no) {
	case PageToday, PageFavorites, PageCalendar, PageCompetitions,
		PageRadar, PageBroadcasters, PageSettings, PageLogs:
		return Page(no), "", true
	}
	n, err := strconv.Atoi(no)
	if err != nil {
		return "", "", false
	}
	if n >= CompBase && n < CompBase+len(comps) {
		return Page(no), comps[n-CompBase].Slug, true
	}
	return "", "", false
}

// CompetitionPage reports the page number to show for a competition slug,
// falling back to the index when the slug is unknown.
func CompetitionPage(slug string, comps []api.CompetitionInfo) Page {
	for i, c := range comps {
		if c.Slug == slug {
			return CompPageNo(i)
		}
	}
	return PageCompetitions
}
