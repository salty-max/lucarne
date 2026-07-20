package ui

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
	"github.com/salty-max/lucarne/apps/tui/internal/i18n"
	"github.com/salty-max/lucarne/apps/tui/internal/theme"
)

func loadMatch(t *testing.T) *api.MatchDetail {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "api", "testdata", "match.json"))
	if err != nil {
		t.Fatalf("fixture: %v", err)
	}
	var res api.MatchDetailResponse
	if err := json.NewDecoder(bytes.NewReader(raw)).Decode(&res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res.Match == nil {
		t.Fatal("fixture has no match")
	}
	return res.Match
}

func matchText(d *api.MatchDetail, w int) string {
	var rows []string
	for _, l := range matchLines(d, w) {
		rows = append(rows, plain(l.text))
	}
	return strings.Join(rows, "\n")
}

// A section must appear when the fixture has the data and stay away when it
// does not — an empty "STATISTIQUES" bar reads as data that failed to load.
func TestMatchSectionsFollowTheData(t *testing.T) {
	d := loadMatch(t)
	text := theme.Upper(matchText(d, 90))
	tr := i18n.T()

	for _, want := range []string{tr.Prediction, tr.Scorers, tr.Cards, tr.Substitutions,
		tr.Statistics, tr.Motm, tr.Lineups} {
		if !strings.Contains(text, theme.Upper(want)) {
			t.Errorf("section %q missing though the fixture has its data", want)
		}
	}

	// Strip every section the fixture supplies; the page must then carry none.
	bare := *d
	bare.Predictions, bare.Statistics, bare.Motm, bare.Lineups = nil, nil, nil, nil
	bare.Events = nil
	bareText := theme.Upper(matchText(&bare, 90))
	for _, gone := range []string{tr.Prediction, tr.Scorers, tr.Cards, tr.Substitutions,
		tr.Statistics, tr.Motm, tr.Lineups} {
		if strings.Contains(bareText, theme.Upper(gone)) {
			t.Errorf("section %q shown with no data behind it", gone)
		}
	}
}

func TestMatchShowsTheResultAndItsCircumstances(t *testing.T) {
	d := loadMatch(t)
	text := theme.Upper(matchText(d, 90))

	for _, want := range []string{
		theme.Upper(teamName(d.Home)),
		theme.Upper(teamName(d.Away)),
	} {
		if !strings.Contains(text, want) {
			t.Errorf("%q missing from the scoreboard", want)
		}
	}
	if d.Referee != nil && !strings.Contains(text, theme.Upper(*d.Referee)) {
		t.Error("referee missing")
	}
	if d.Venue != nil && !strings.Contains(text, theme.Upper(*d.Venue)) {
		t.Error("venue missing")
	}
	if d.Round != nil && !strings.Contains(text, theme.Upper(*d.Round)) {
		t.Error("round missing from the competition bar")
	}
}

// Every goal, card and substitution the fixture carries has to appear. Losing
// one is losing the record of the match.
func TestEveryEventIsRendered(t *testing.T) {
	d := loadMatch(t)
	text := theme.Upper(matchText(d, 90))

	goals, cards, subs := splitEvents(d.Events)
	if len(goals)+len(cards)+len(subs) != len(d.Events) {
		t.Errorf("%d events split into %d", len(d.Events), len(goals)+len(cards)+len(subs))
	}
	for _, e := range append(append(append([]api.MatchEvent{}, goals...), cards...), subs...) {
		if e.Player == nil {
			continue
		}
		if !strings.Contains(text, theme.Upper(*e.Player)) {
			t.Errorf("event player %q missing", *e.Player)
		}
	}
}

// A rating of zero means the API had no opinion, not that the player was
// terrible; printing it would invent a judgement.
func TestZeroRatingsAreNotShown(t *testing.T) {
	zero, good := 0.0, 7.4
	row := plain(playerRow(api.LineupPlayer{Name: "Nobody", Rating: &zero}, 60))
	if strings.Contains(row, "0.0") {
		t.Errorf("an unrated player was given a rating: %q", row)
	}
	row = plain(playerRow(api.LineupPlayer{Name: "Somebody", Rating: &good}, 60))
	if !strings.Contains(row, "7.4") {
		t.Errorf("a real rating was dropped: %q", row)
	}
}

// The probability bar must be readable without colour: the figures are printed
// beside it, and the three shares are proportioned, not equal thirds.
func TestPredictionIsReadableWithoutColour(t *testing.T) {
	p := api.MatchPrediction{Home: 70, Draw: 20, Away: 10}
	var rows []string
	for _, l := range predictionLines(p, 80) {
		rows = append(rows, plain(l.text))
	}
	text := strings.Join(rows, "\n")
	for _, want := range []string{"70%", "20%", "10%"} {
		if !strings.Contains(text, want) {
			t.Errorf("%q not printed beside the bar: %q", want, text)
		}
	}
}

func TestNoMatchLineOverflows(t *testing.T) {
	d := loadMatch(t)
	for _, w := range []int{40, 56, 74, 100} {
		for i, l := range matchLines(d, w) {
			if got := theme.Width(plain(l.text)); got > w {
				t.Errorf("width %d: line %d is %d columns: %q", w, i, got, plain(l.text))
			}
		}
	}
}
