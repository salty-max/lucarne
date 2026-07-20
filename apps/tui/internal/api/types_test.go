package api

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// The fixtures are real responses captured from the running API. Decoding them
// is what actually proves the generated types are right — in particular the
// int/float decision, which TypeScript cannot express and which fails at
// runtime rather than at compile time when it is wrong.
//
// DisallowUnknownFields is deliberate: without it, json.Unmarshal silently
// ignores fields the Go types lack, so a drifted contract would still pass.

func decodeFixture(t *testing.T, name string, into any) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(into); err != nil {
		t.Fatalf("decode %s: %v", name, err)
	}
}

func TestDecodeSchedule(t *testing.T) {
	var got ScheduleResponse
	decodeFixture(t, "schedule.json", &got)

	if len(got.Days) == 0 {
		t.Fatal("no days decoded — the fixture or the type is wrong")
	}
	var matches int
	for _, d := range got.Days {
		if d.Key == "" || d.Label == "" {
			t.Errorf("day missing key/label: %+v", d)
		}
		matches += len(d.Matches)
	}
	if matches == 0 {
		t.Fatal("no matches decoded")
	}

	m := got.Days[0].Matches[0]
	if m.ID == 0 || m.Kickoff == "" || m.Home.Name == "" || m.Away.Name == "" {
		t.Errorf("match decoded but empty: %+v", m)
	}
	if m.Competition.Slug == "" {
		t.Error("inline competition object did not decode")
	}
}

// Ratings are the reason FLOAT_FIELDS exists in the generator: they arrive as
// 6.05, and an int field would fail to unmarshal.
func TestDecodeMatchDetailFloats(t *testing.T) {
	var got MatchDetailResponse
	decodeFixture(t, "match.json", &got)

	if got.Match == nil {
		t.Fatal("match is null in the fixture")
	}
	if got.Match.Lineups == nil {
		t.Fatal("fixture has no lineups, so it cannot exercise ratings")
	}

	var rated int
	var sawFractional bool
	for _, side := range []TeamLineup{got.Match.Lineups.Home, got.Match.Lineups.Away} {
		for _, p := range append(append([]LineupPlayer{}, side.StartXI...), side.Substitutes...) {
			if p.Rating == nil {
				continue
			}
			rated++
			if *p.Rating != float64(int(*p.Rating)) {
				sawFractional = true
			}
		}
	}
	if rated == 0 {
		t.Fatal("no ratings decoded")
	}
	if !sawFractional {
		t.Error("no fractional rating in the fixture — the float path is unproven")
	}
}

func TestDecodeLive(t *testing.T) {
	var got LiveResponse
	decodeFixture(t, "live.json", &got)
	// Off-season, this is legitimately empty; the point is that the shape holds.
	for _, m := range got.Matches {
		if m.ID == 0 {
			t.Errorf("live match without an id: %+v", m)
		}
	}
}

func TestDecodeCompetitions(t *testing.T) {
	var got CompetitionsResponse
	decodeFixture(t, "competitions.json", &got)
	if len(got.Competitions) == 0 {
		t.Fatal("no competitions decoded")
	}
	for _, c := range got.Competitions {
		if c.Slug == "" || c.Name == "" {
			t.Errorf("competition missing slug/name: %+v", c)
		}
	}
}

func TestDecodeCompetitionDetail(t *testing.T) {
	var got CompetitionDetailResponse
	decodeFixture(t, "competition.json", &got)
	if got.Competition == nil {
		t.Fatal("competition is null in the fixture")
	}
	if got.Competition.Standings == nil {
		t.Skip("fixture has no standings")
	}
	for _, g := range got.Competition.Standings {
		for _, r := range g.Rows {
			if r.Team.Name == "" {
				t.Errorf("standing row without a team: %+v", r)
			}
		}
	}
}

// MatchStatus is generated as a named string type with constants; make sure the
// values the API actually sends are among them.
func TestMatchStatusValues(t *testing.T) {
	var got ScheduleResponse
	decodeFixture(t, "schedule.json", &got)
	known := map[MatchStatus]bool{
		MatchStatusScheduled: true,
		MatchStatusLive:      true,
		MatchStatusFinished:  true,
		MatchStatusPostponed: true,
	}
	for _, d := range got.Days {
		for _, m := range d.Matches {
			if !known[m.Status] {
				t.Errorf("unknown status %q — the union is out of date", m.Status)
			}
		}
	}
}
