package ui

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
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
		tr.Statistics, tr.Motm, tr.Lineups, tr.WhereToWatch, tr.Info} {
		if !strings.Contains(text, theme.Upper(want)) {
			t.Errorf("section %q missing though the fixture has its data", want)
		}
	}

	// Strip every section the fixture supplies; the page must then carry none.
	bare := *d
	bare.Predictions, bare.Statistics, bare.Motm, bare.Lineups = nil, nil, nil, nil
	bare.Events, bare.Broadcasters = nil, nil
	bareText := theme.Upper(matchText(&bare, 90))
	// Info always shows: a match always has a date, a competition and a kick-off.
	for _, gone := range []string{tr.Prediction, tr.Scorers, tr.Cards, tr.Substitutions,
		tr.Statistics, tr.Motm, tr.Lineups, tr.WhereToWatch} {
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
	row := plain(playerCell(api.LineupPlayer{Name: "Nobody", Rating: &zero}, 30))
	if strings.Contains(row, "0.0") {
		t.Errorf("an unrated player was given a rating: %q", row)
	}
	row = plain(playerCell(api.LineupPlayer{Name: "Somebody", Rating: &good}, 30))
	if !strings.Contains(row, "7.4") {
		t.Errorf("a real rating was dropped: %q", row)
	}
}

func predictionText(p api.MatchPrediction, w int) string {
	var rows []string
	for _, l := range predictionLines(p, w) {
		rows = append(rows, plain(l.text))
	}
	return strings.Join(rows, "\n")
}

// All three figures must survive every distribution and width. A lopsided
// prediction leaves a segment one column wide; aligning under it is impossible,
// and the fallback must state the figures plainly rather than drop one.
func TestPredictionAlwaysStatesAllThree(t *testing.T) {
	for _, w := range []int{40, 56, 80, 120} {
		for _, p := range []api.MatchPrediction{
			{Home: 45, Draw: 45, Away: 10},
			{Home: 70, Draw: 20, Away: 10},
			{Home: 10, Draw: 20, Away: 70},
			{Home: 96, Draw: 3, Away: 1},
			{Home: 1, Draw: 1, Away: 98},
			{Home: 33, Draw: 34, Away: 33},
		} {
			text := predictionText(p, w)
			for _, want := range []string{
				strconv.Itoa(p.Home) + "%", strconv.Itoa(p.Draw) + "%", strconv.Itoa(p.Away) + "%",
			} {
				if !strings.Contains(text, want) {
					t.Errorf("width %d, %d/%d/%d: %q missing\n%s",
						w, p.Home, p.Draw, p.Away, want, text)
				}
			}
		}
	}
}

// Labels are placed under their own segment, so the home figure must sit left of
// the away one — that is the whole point of aligning them.
func TestPredictionLabelsFollowTheirSegments(t *testing.T) {
	p := api.MatchPrediction{Home: 70, Draw: 20, Away: 10}
	rows := strings.Split(predictionText(p, 80), "\n")
	labels := rows[len(rows)-1]

	home := strings.Index(labels, "70%")
	away := strings.Index(labels, "10%")
	if home < 0 || away < 0 {
		t.Fatalf("figures missing: %q", labels)
	}
	if home >= away {
		t.Errorf("home figure at %d is not left of away at %d: %q", home, away, labels)
	}
	// And the away figure ends at the right edge, under its segment.
	if trimmed := strings.TrimRight(labels, " "); !strings.HasSuffix(trimmed, "10%") {
		t.Errorf("the away figure is not set right: %q", labels)
	}
}

// Labels that merely touch read as one word and the pairing is lost.
func TestPredictionLabelsKeepClearOfEachOther(t *testing.T) {
	for _, w := range []int{40, 56, 80} {
		for _, p := range []api.MatchPrediction{
			{Home: 10, Draw: 20, Away: 70},
			{Home: 45, Draw: 45, Away: 10},
			{Home: 33, Draw: 34, Away: 33},
		} {
			rows := strings.Split(predictionText(p, w), "\n")
			labels := rows[len(rows)-1]
			if strings.Contains(labels, "%NUL") || strings.Contains(labels, "%DRAW") {
				t.Errorf("width %d, %d/%d/%d: labels collide: %q",
					w, p.Home, p.Draw, p.Away, labels)
			}
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
