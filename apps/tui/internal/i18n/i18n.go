// Package i18n holds the terminal client's user-facing strings.
//
// The web client ships French and English and defaults to French; this mirrors
// that rather than hardcoding either, which is what CLAUDE.md asks for. Set
// LUCARNE_LANG=en to switch.
package i18n

import (
	"fmt"
	"os"
	"time"
)

// Lang is a supported UI language.
type Lang string

const (
	FR Lang = "fr"
	EN Lang = "en"
)

// Messages is every string the interface shows. Keeping it a struct rather than
// a map means a missing translation is a compile error, not a blank label.
type Messages struct {
	Today, Calendar, Competitions, Broadcasters string
	MyTeams, Radar, Settings, Logs              string
	Live, Match                                 string

	TodaySub, CalendarSub, CompetitionsSub string

	Loading, NoMatches, NoResponse, CheckAPI string
	NotYet                                   string

	Prediction, Scorers, Cards, Substitutions string
	Lineups, Statistics, Standings            string
	TopScorers, TopAssists, Referee, Venue    string
	Draw, Pens, Postponed, FullTime           string

	Page, Move, Open, Sections, Back, Quit string

	MatchOne, MatchMany string

	Motm, Formation, Coach, Bench, Starters string
	AfterExtraTime, AfterPens               string
	Possession, Shots, OnTarget, Corners    string
	Fouls, Offsides, Saves, PassAccuracy    string
	XG, YellowCards, RedCards               string
}

var fr = Messages{
	Today: "Direct", Calendar: "Calendrier", Competitions: "Compét.", Broadcasters: "Diffuseurs",
	MyTeams: "Mes équipes", Radar: "Radar", Settings: "Réglages", Logs: "Logs",
	Live: "Direct", Match: "Match",

	TodaySub:        "Le programme et où le voir",
	CalendarSub:     "Choisir un jour",
	CompetitionsSub: "Classements et résultats",

	Loading:    "Chargement…",
	NoMatches:  "Aucun match ce jour-là.",
	NoResponse: "Pas de réponse de l'API",
	CheckAPI:   "Vérifiez que l'API tourne.",
	NotYet:     "Pas encore dans le client terminal.",

	Prediction: "Pronostic", Scorers: "Buteurs", Cards: "Cartons",
	Substitutions: "Remplacements", Lineups: "Compositions",
	Statistics: "Statistiques", Standings: "Classement",
	TopScorers: "Buteurs", TopAssists: "Passeurs",
	Referee: "Arbitre", Venue: "Stade",
	Draw: "Nul", Pens: "T.a.b.", Postponed: "Reporté", FullTime: "Terminé",

	Page: "aller à la page", Move: "naviguer", Open: "ouvrir",
	Sections: "sections", Back: "retour", Quit: "quitter",

	MatchOne: "match", MatchMany: "matchs",

	Motm: "Homme du match", Formation: "Formation", Coach: "Entraîneur",
	Bench: "Remplaçants", Starters: "Titulaires",
	AfterExtraTime: "Après prolongation", AfterPens: "Après t.a.b.",
	Possession: "Possession", Shots: "Tirs", OnTarget: "Cadrés", Corners: "Corners",
	Fouls: "Fautes", Offsides: "Hors-jeu", Saves: "Arrêts", PassAccuracy: "Passes réussies",
	XG: "Buts attendus", YellowCards: "Cartons jaunes", RedCards: "Cartons rouges",
}

var en = Messages{
	Today: "Live", Calendar: "Calendar", Competitions: "Competitions", Broadcasters: "Broadcasters",
	MyTeams: "My teams", Radar: "Radar", Settings: "Settings", Logs: "Logs",
	Live: "Live", Match: "Match",

	TodaySub:        "Fixtures and where to watch",
	CalendarSub:     "Pick a day",
	CompetitionsSub: "Tables and results",

	Loading:    "Loading…",
	NoMatches:  "No matches on this day.",
	NoResponse: "No response from the API",
	CheckAPI:   "Check that the API is running.",
	NotYet:     "Not in the terminal client yet.",

	Prediction: "Prediction", Scorers: "Scorers", Cards: "Cards",
	Substitutions: "Substitutions", Lineups: "Lineups",
	Statistics: "Statistics", Standings: "Standings",
	TopScorers: "Top scorers", TopAssists: "Top assists",
	Referee: "Referee", Venue: "Venue",
	Draw: "Draw", Pens: "Pens", Postponed: "Postponed", FullTime: "Full time",

	Page: "go to page", Move: "navigate", Open: "open",
	Sections: "sections", Back: "back", Quit: "quit",

	MatchOne: "match", MatchMany: "matches",

	Motm: "Man of the match", Formation: "Formation", Coach: "Coach",
	Bench: "Substitutes", Starters: "Starting XI",
	AfterExtraTime: "After extra time", AfterPens: "After penalties",
	Possession: "Possession", Shots: "Shots", OnTarget: "On target", Corners: "Corners",
	Fouls: "Fouls", Offsides: "Offsides", Saves: "Saves", PassAccuracy: "Pass accuracy",
	XG: "Expected goals", YellowCards: "Yellow cards", RedCards: "Red cards",
}

var active = detect()

func detect() Messages {
	if os.Getenv("LUCARNE_LANG") == string(EN) {
		return en
	}
	return fr
}

// T returns the active language's messages.
func T() Messages { return active }

// SetLang overrides the detected language. Tests use it.
func SetLang(l Lang) {
	lang = l
	if l == EN {
		active = en
		return
	}
	active = fr
}

// Plural picks the right noun for a count.
func Plural(n int, one, many string) string {
	if n <= 1 {
		return one
	}
	return many
}

// The API sends day labels already formatted in English (its parisDayLabel uses
// en-GB). The web client ignores that and formats from the ISO key in the UI
// language; doing the same here is what stops a French page carrying an English
// date. Go has no locale-aware month names, so the tables are explicit.
var weekdays = map[Lang][7]string{
	FR: {"dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"},
	EN: {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"},
}

var months = map[Lang][12]string{
	FR: {"janvier", "février", "mars", "avril", "mai", "juin",
		"juillet", "août", "septembre", "octobre", "novembre", "décembre"},
	EN: {"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"},
}

var lang = detectLang()

func detectLang() Lang {
	if os.Getenv("LUCARNE_LANG") == string(EN) {
		return EN
	}
	return FR
}

// DayLabel formats an ISO date (2006-01-02) as a long localised day.
func DayLabel(iso string) string {
	t, err := time.Parse("2006-01-02", iso)
	if err != nil {
		return iso
	}
	return fmt.Sprintf("%s %d %s",
		weekdays[lang][int(t.Weekday())], t.Day(), months[lang][int(t.Month())-1])
}
