package i18n

import "regexp"

// Data coming out of the API is in English: team names, competitions, countries,
// rounds and broadcaster notes. The web client translates them at the display
// boundary and so does this — the tables are generated from its maps
// (labels_gen.go), and only the pattern-matching below is hand-written, because
// rounds are matched rather than looked up.
//
// Anything absent passes through unchanged. A club keeps its own name in both
// languages, and inventing a French form for one would be worse than leaving it.

var (
	reMatchday   = regexp.MustCompile(`^(?:Regular Season|Group Stage|League Phase) - (\d+)$`)
	reQualifying = regexp.MustCompile(`^(\d+)(?:st|nd|rd|th) Qualifying Round$`)
	reGroup      = regexp.MustCompile(`^Group ([A-Z0-9]+)$`)
)

var knockoutFR = map[string]string{
	"Round of 32":              "16es de finale",
	"Round of 16":              "8es de finale",
	"Quarter-finals":           "Quarts de finale",
	"Semi-finals":              "Demi-finales",
	"3rd Place Final":          "Petite finale",
	"Final":                    "Finale",
	"Play-offs":                "Barrages",
	"Play-off Round":           "Barrages",
	"Knockout Round Play-offs": "Barrages",
}

// Round translates an API round name. Numbered league rounds become
// "Journée N" / "Matchday N"; English rounds otherwise read fine as they are.
func Round(round string) string {
	if round == "" {
		return ""
	}
	if m := reMatchday.FindStringSubmatch(round); m != nil {
		if lang == FR {
			return "Journée " + m[1]
		}
		return "Matchday " + m[1]
	}
	if lang != FR {
		return round
	}
	if fr, ok := knockoutFR[round]; ok {
		return fr
	}
	if m := reQualifying.FindStringSubmatch(round); m != nil {
		ord := m[1] + "e"
		if m[1] == "1" {
			ord = "1er"
		}
		return ord + " tour de qualif."
	}
	if m := reGroup.FindStringSubmatch(round); m != nil {
		return "Groupe " + m[1]
	}
	return round
}

// Team translates a national team name. Clubs are not in the table and pass
// through, which is deliberate: French media use the club's own name.
func Team(name string) string { return lookup(teamFR, name) }

// Competition translates the competitions French media translate. Leagues keep
// their brand name — nobody says "Première Ligue".
func Competition(name string) string { return lookup(competitionFR, name) }

// Country translates a competition's country.
func Country(name string) string { return lookup(countryFR, name) }

// Note translates a broadcaster's coverage note.
func Note(name string) string { return lookup(noteFR, name) }

func lookup(table map[string]string, key string) string {
	if key == "" || lang != FR {
		return key
	}
	if v, ok := table[key]; ok {
		return v
	}
	return key
}
