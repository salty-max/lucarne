package ui

import (
	"strings"
	"testing"

	"github.com/salty-max/lucarne/apps/tui/internal/api"
	"github.com/salty-max/lucarne/apps/tui/internal/theme"
)

func fixture(comp string, casts ...string) api.Match {
	var bs []api.Broadcaster
	for _, c := range casts {
		bs = append(bs, api.Broadcaster{Name: c})
	}
	f := api.Match{ID: len(casts) + len(comp), Kickoff: "2026-07-23T18:00:00.000Z",
		Status: api.MatchStatusScheduled, Broadcasters: bs,
		Home: api.Team{Name: "A"}, Away: api.Team{Name: "B"}}
	f.Competition.Name = comp
	return f
}

func TestGroupsKeepFirstAppearanceOrder(t *testing.T) {
	got := groupByCompetition([]api.Match{
		fixture("Ligue 1", "X"),
		fixture("Premier League", "Y"),
		fixture("Ligue 1", "X"),
	})
	if len(got) != 2 {
		t.Fatalf("got %d groups, want 2", len(got))
	}
	if got[0].name != "Ligue 1" || got[1].name != "Premier League" {
		t.Errorf("order changed: %s then %s", got[0].name, got[1].name)
	}
	if len(got[0].matches) != 2 {
		t.Errorf("Ligue 1 has %d fixtures, want 2", len(got[0].matches))
	}
}

// Hoisting is only safe when the whole group really does share a broadcaster.
// Rights are split within a competition often enough that stating a partial one
// on the bar would be telling the user to watch the wrong channel.
func TestBroadcasterHoistsOnlyWhenUniform(t *testing.T) {
	uniform := groupByCompetition([]api.Match{
		fixture("Conference League", "Canal+"),
		fixture("Conference League", "Canal+"),
	})
	if uniform[0].sharedCast != "Canal+" {
		t.Errorf("uniform group did not hoist: %q", uniform[0].sharedCast)
	}

	mixed := groupByCompetition([]api.Match{
		fixture("Ligue 1", "Ligue 1+"),
		fixture("Ligue 1", "beIN SPORTS 1"),
	})
	if mixed[0].sharedCast != "" {
		t.Errorf("split rights were hoisted as %q", mixed[0].sharedCast)
	}

	none := groupByCompetition([]api.Match{fixture("Cup")})
	if none[0].sharedCast != "" {
		t.Errorf("a group with no broadcaster hoisted %q", none[0].sharedCast)
	}
}

// The consequence that matters: when rights are split, every row must still
// carry its own channel. Losing that is losing the point of the app.
func TestSplitRightsKeepPerRowBroadcasters(t *testing.T) {
	day := api.Day{Key: "2026-07-23", Label: "x", Matches: []api.Match{
		fixture("Ligue 1", "Ligue 1+"),
		fixture("Ligue 1", "beIN SPORTS 1"),
	}}
	m := modelAt([]api.Day{day}, 0, 90)
	// Tags are set in capitals, as teletext is throughout.
	text := theme.Upper(plain(bodyOf(m)))
	for _, want := range []string{"LIGUE 1+", "BEIN SPORTS 1"} {
		if !strings.Contains(text, want) {
			t.Errorf("%q missing when rights are split:\n%s", want, text)
		}
	}
}

// And when they are uniform, the channel is stated once on the bar rather than
// repeated on every row — which was the point of moving it.
func TestUniformRightsStateTheChannelOnce(t *testing.T) {
	day := api.Day{Key: "2026-07-23", Label: "x", Matches: []api.Match{
		fixture("Conference League", "Canal+"),
		fixture("Conference League", "Canal+"),
		fixture("Conference League", "Canal+"),
	}}
	m := modelAt([]api.Day{day}, 0, 90)
	text := plain(bodyOf(m))
	if n := strings.Count(theme.Upper(text), "CANAL+"); n != 1 {
		t.Errorf("channel appears %d times, want 1:\n%s", n, text)
	}
}
