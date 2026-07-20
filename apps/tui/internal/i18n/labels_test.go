package i18n

import "testing"

func TestRoundsTranslate(t *testing.T) {
	SetLang(FR)
	defer SetLang(FR)

	cases := map[string]string{
		"Regular Season - 12":      "Journée 12",
		"League Phase - 3":         "Journée 3",
		"Round of 16":              "8es de finale",
		"Quarter-finals":           "Quarts de finale",
		"Final":                    "Finale",
		"3rd Place Final":          "Petite finale",
		"1st Qualifying Round":     "1er tour de qualif.",
		"2nd Qualifying Round":     "2e tour de qualif.",
		"Group A":                  "Groupe A",
		"Knockout Round Play-offs": "Barrages",
		"":                         "",
		// Not in any pattern or table: must pass through untouched rather than
		// be mangled into something that looks translated.
		"Some Unknown Round": "Some Unknown Round",
	}
	for in, want := range cases {
		if got := Round(in); got != want {
			t.Errorf("Round(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRoundsStayEnglishInEnglish(t *testing.T) {
	SetLang(EN)
	defer SetLang(FR)

	if got := Round("Regular Season - 12"); got != "Matchday 12" {
		t.Errorf("Round = %q, want Matchday 12", got)
	}
	// English rounds already read fine; nothing should be rewritten.
	for _, in := range []string{"Round of 16", "Final", "Group A"} {
		if got := Round(in); got != in {
			t.Errorf("Round(%q) = %q, want it unchanged", in, got)
		}
	}
}

func TestTablesTranslateAndPassThrough(t *testing.T) {
	SetLang(FR)
	defer SetLang(FR)

	cases := []struct {
		name    string
		fn      func(string) string
		in, out string
	}{
		{"team", Team, "Spain", "Espagne"},
		{"team", Team, "Argentina", "Argentine"},
		// A club is not in the table and must keep its own name: French media
		// say Manchester City, and inventing a translation would be worse.
		{"club passes through", Team, "Manchester City", "Manchester City"},
		{"competition", Competition, "World Cup", "Coupe du Monde"},
		// Leagues keep their brand name.
		{"league passes through", Competition, "Premier League", "Premier League"},
		{"country", Country, "England", "Angleterre"},
		{"note", Note, "Until 2027", "Jusqu'en 2027"},
		{"empty", Team, "", ""},
	}
	for _, c := range cases {
		if got := c.fn(c.in); got != c.out {
			t.Errorf("%s: %q -> %q, want %q", c.name, c.in, got, c.out)
		}
	}
}

func TestNothingIsTranslatedInEnglish(t *testing.T) {
	SetLang(EN)
	defer SetLang(FR)

	for _, in := range []string{"Spain", "World Cup", "England", "Until 2027"} {
		for _, fn := range []func(string) string{Team, Competition, Country, Note} {
			if got := fn(in); got != in {
				t.Errorf("%q was translated to %q under EN", in, got)
			}
		}
	}
}

// The generated tables are the point of the exercise; an empty one would make
// every lookup silently pass through and look like "no translation needed".
func TestGeneratedTablesAreNotEmpty(t *testing.T) {
	for name, table := range map[string]map[string]string{
		"teamFR": teamFR, "competitionFR": competitionFR,
		"countryFR": countryFR, "noteFR": noteFR,
	} {
		if len(table) == 0 {
			t.Errorf("%s is empty — regeneration produced nothing", name)
		}
	}
	if len(teamFR) < 50 {
		t.Errorf("teamFR has only %d entries; the national-team table should be far larger", len(teamFR))
	}
}
