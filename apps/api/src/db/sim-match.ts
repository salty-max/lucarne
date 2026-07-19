/**
 * Match-lifecycle simulator — drives the REAL poller jobs against a faked
 * API-Football so the whole pipeline (live poll → finalise → drain → push) and
 * the front's refresh can be verified without waiting for a real match.
 *
 *   bun run src/db/sim-match.ts                  # fast: run all stages, assert
 *   bun run src/db/sim-match.ts --delay=35       # pause 35s/stage to watch the front
 *   bun run src/db/sim-match.ts --home=France --away=Angleterre   # follow one to test push
 *   bun run src/db/sim-match.ts --keep           # leave the fake match in the DB
 *
 * It writes to local.db, so with `bun run dev` up you can watch Today / the match
 * page update live; if a push subscription follows the home/away team, real
 * notifications fire for the fake events.
 */
import { eq, inArray } from "drizzle-orm";
import { initLocalDb } from "@/db/local";
import { db } from "@/db";
import {
  competitions,
  matches,
  matchEvents,
  matchLineups,
  pushNotified,
  pushSubscription,
  syncState,
  teams,
} from "@/db/schema";
import { runEagerDrain, runLineupPoll, runLivePollTick } from "@/lib/poller";
import { runLiveEnrich } from "@/lib/poller";
import { runPushNotify } from "@/lib/pushTrigger";
import type { ApiEvent, ApiFixture, ApiLineup } from "@/lib/api-football";

const arg = (name: string, def: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const has = (name: string) => process.argv.includes(`--${name}`);
const DELAY = Number(arg("delay", "0")) * 1000;
const HOME = arg("home", "France");
const AWAY = arg("away", "Angleterre");
const KEEP = has("keep");

const FIX = 9990001;
const HOME_API = 9990011;
const AWAY_API = 9990012;
const LEAGUE = 1; // FIFA World Cup — a tracked league
const SIM_ENDPOINT = "https://sim.invalid/push";

// ---- faked API state, mutated per stage; served by the mocked fetch ----
const state: {
  live: ApiFixture[];
  byId: Record<number, ApiFixture>;
  events: Record<number, ApiEvent[]>;
  lineups: Record<number, ApiLineup[]>;
} = { live: [], byId: {}, events: {}, lineups: {} };

globalThis.fetch = (async (input: string | URL) => {
  const url = new URL(String(input));
  const p = url.pathname;
  const q = url.searchParams;
  let data: unknown = [];
  if (p === "/fixtures" && q.get("live") === "all") data = state.live;
  else if (p === "/fixtures" && q.get("id")) {
    const f = state.byId[Number(q.get("id"))];
    data = f ? [f] : [];
  } else if (p === "/fixtures/events") data = state.events[Number(q.get("fixture"))] ?? [];
  else if (p === "/fixtures/lineups") data = state.lineups[Number(q.get("fixture"))] ?? [];
  return new Response(JSON.stringify({ response: data }), { status: 200 });
}) as typeof fetch;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let season = 2026;
let kickoffISO = "";

// runLivePollTick throttles to ~60s between polls; advance a virtual clock so
// back-to-back sim stages each actually poll instead of being throttled.
let pollN = 0;
const poll = () => runLivePollTick(new Date(Date.now() + ++pollN * 120_000));

function fixture(short: string, elapsed: number | null, h: number | null, a: number | null): ApiFixture {
  return {
    fixture: { id: FIX, date: kickoffISO, referee: "Sim Referee", venue: { name: "Sim Stadium" }, status: { short, elapsed } },
    league: { id: LEAGUE, season, round: "3rd Place Final" },
    teams: { home: { id: HOME_API, name: HOME, logo: "" }, away: { id: AWAY_API, name: AWAY, logo: "" } },
    goals: { home: h, away: a },
    score: {},
  };
}
function goal(teamApi: number, minute: number, player: string): ApiEvent {
  return { time: { elapsed: minute, extra: null }, team: { id: teamApi, name: "" }, player: { id: 1, name: player }, assist: { id: null, name: null }, type: "Goal", detail: "Normal Goal", comments: null };
}
function card(teamApi: number, minute: number, player: string, red = false): ApiEvent {
  return { time: { elapsed: minute, extra: null }, team: { id: teamApi, name: "" }, player: { id: 2, name: player }, assist: { id: null, name: null }, type: "Card", detail: red ? "Red Card" : "Yellow Card", comments: null };
}
function lineup(teamApi: number): ApiLineup {
  return {
    team: { id: teamApi, name: "" },
    formation: "4-3-3",
    coach: { id: null, name: "Coach" },
    startXI: [{ player: { id: 10, name: "Player", number: 10, pos: "M", grid: "1:1" } }],
    substitutes: [],
  };
}

let failures = 0;
async function dbMatch() {
  const [m] = await db.select().from(matches).where(eq(matches.apiFootballId, FIX));
  return m;
}
function check(label: string, cond: boolean, detail = "") {
  console.log(`   ${cond ? "✓" : "✗ FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!cond) failures++;
}

async function cleanup() {
  const [m] = await db.select({ id: matches.id }).from(matches).where(eq(matches.apiFootballId, FIX));
  if (m) {
    await db.delete(matchEvents).where(eq(matchEvents.matchId, m.id));
    await db.delete(matchLineups).where(eq(matchLineups.matchId, m.id));
    await db.delete(pushNotified).where(eq(pushNotified.matchId, m.id));
    await db.delete(matches).where(eq(matches.id, m.id));
  }
  await db.delete(teams).where(inArray(teams.apiFootballId, [HOME_API, AWAY_API]));
  await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, SIM_ENDPOINT));
  // Reset the live-poll budget/throttle — the sim's virtual clock writes a future
  // lastPollAt that would otherwise throttle the next run (and the real dev poll).
  await db.delete(syncState).where(eq(syncState.key, "api_budget"));
}

async function seed() {
  const [wc] = await db.select({ id: competitions.id, season: competitions.apiFootballId }).from(competitions).where(eq(competitions.apiFootballId, LEAGUE));
  if (!wc) throw new Error("World Cup competition (apiFootballId=1) not in local.db — run `bun run db:seed` first.");
  // fresh sim state
  await cleanup();
  const now = Date.now();
  kickoffISO = new Date(now - 2 * 60_000).toISOString(); // kicked off 2 min ago
  const rows = [
    { apiFootballId: HOME_API, name: HOME, shortName: HOME },
    { apiFootballId: AWAY_API, name: AWAY, shortName: AWAY },
  ];
  const ids = new Map<number, number>();
  for (const r of rows) {
    const [t] = await db.insert(teams).values(r).onConflictDoUpdate({ target: teams.apiFootballId, set: { name: r.name } }).returning({ id: teams.id, api: teams.apiFootballId });
    ids.set(t.api, t.id);
  }
  await db.insert(matches).values({
    apiFootballId: FIX,
    competitionId: wc.id,
    season,
    round: "3rd Place Final",
    kickoff: new Date(now - 2 * 60_000),
    statusShort: "NS",
    status: "scheduled",
    homeTeamId: ids.get(HOME_API)!,
    awayTeamId: ids.get(AWAY_API)!,
  });
  // a fake subscription following the home team, so the push trigger actually
  // runs. Real EC keys so encryption succeeds; delivery to the bogus endpoint
  // fails harmlessly — what we assert is `fired` (the trigger + dedup logic).
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const p256dh = Buffer.from(await crypto.subtle.exportKey("raw", kp.publicKey)).toString("base64url");
  const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
  await db.insert(pushSubscription).values({ endpoint: SIM_ENDPOINT, p256dh, auth, teams: [HOME], triggers: ["goal", "yellow", "red", "kickoff", "ft"] });
}

async function stage(name: string, note: string, fn: () => Promise<void>) {
  console.log(`\n=== ${name} ===  ${note}`);
  await fn();
  if (DELAY) await sleep(DELAY);
}

async function main() {
  initLocalDb();
  season = Number(process.env.CURRENT_SEASON ?? "2026");
  console.log(`Simulating ${HOME} vs ${AWAY} (World Cup) — delay ${DELAY / 1000}s/stage\n`);
  await seed();

  await stage("T-0  LINEUPS", "compos publiées → front: fiche match affiche les compos", async () => {
    state.lineups[FIX] = [lineup(HOME_API), lineup(AWAY_API)];
    const r = await runLineupPoll();
    check("lineup poll picked up the match", r.matches >= 1);
    check("lineupsFetchedAt stamped", (await dbMatch()).lineupsFetchedAt != null);
    const p = await runPushNotify();
    check("lineups push fired", p.fired === 1, `fired=${p.fired}`);
  });

  await stage("KICKOFF", "1H 1' → front Today: passe en DIRECT", async () => {
    state.live = [fixture("1H", 1, 0, 0)];
    state.byId[FIX] = state.live[0];
    const r = await poll();
    const m = await dbMatch();
    check("polled", r.polled === true);
    check("status live", m.status === "live", m.status);
    check("elapsed 1", m.elapsed === 1);
  });

  await stage("GOAL 23' (home)", "1-0 + buteur → front: score + notif but", async () => {
    state.live = [fixture("1H", 23, 1, 0)];
    state.byId[FIX] = state.live[0];
    state.events[FIX] = [goal(HOME_API, 23, "Mbappé")];
    await poll();
    await runLiveEnrich();
    const r = await runPushNotify();
    const m = await dbMatch();
    check("score 1-0", m.homeGoals === 1 && m.awayGoals === 0, `${m.homeGoals}-${m.awayGoals}`);
    check("event stored", (await db.select().from(matchEvents).where(eq(matchEvents.matchId, m.id))).length === 1);
    check("push fired once", r.fired === 1, `fired=${r.fired}`);
  });

  await stage("DEDUP", "même but re-fetché (nom affiné) → AUCUNE 2e notif", async () => {
    state.events[FIX] = [goal(HOME_API, 23, "K. Mbappé")]; // player name refined
    await runLiveEnrich();
    const r = await runPushNotify();
    check("no duplicate push", r.fired === 0, `fired=${r.fired}`);
  });

  await stage("HT", "mi-temps", async () => {
    state.live = [fixture("HT", 45, 1, 0)];
    state.byId[FIX] = state.live[0];
    await poll();
    const m = await dbMatch();
    check("status still live", m.status === "live");
    check("statusShort HT", m.statusShort === "HT", m.statusShort);
  });

  await stage("GOAL 70' + yellow 65'", "1-1 + notifs but adverse & carton", async () => {
    state.live = [fixture("2H", 70, 1, 1)];
    state.byId[FIX] = state.live[0];
    state.events[FIX] = [
      goal(HOME_API, 23, "K. Mbappé"),
      card(AWAY_API, 65, "Rice"),
      goal(AWAY_API, 70, "Kane"),
    ];
    await poll();
    await runLiveEnrich();
    const r = await runPushNotify();
    const m = await dbMatch();
    check("score 1-1", m.homeGoals === 1 && m.awayGoals === 1);
    check("2 pushes fired (new goal + new card, not the old goal)", r.fired === 2, `fired=${r.fired}`);
  });

  await stage("FULL TIME", "drops from live=all → FINALISE 1-2 (late England goal) + FT push", async () => {
    // The match is over: it's NO LONGER in live=all. getFixtureById returns the
    // authoritative final: a late away goal we never saw live (the user's bug).
    state.live = [];
    state.byId[FIX] = fixture("FT", 90, 1, 2);
    state.events[FIX] = [
      goal(HOME_API, 23, "K. Mbappé"),
      card(AWAY_API, 65, "Rice"),
      goal(AWAY_API, 70, "Kane"),
      goal(AWAY_API, 88, "Bellingham"),
    ];
    const tick = await poll();
    const m = await dbMatch();
    check("finalized 1 match", (tick.finalized ?? 0) === 1, `finalized=${tick.finalized}`);
    check("status finished", m.status === "finished", m.status);
    check("score corrected to 1-2", m.homeGoals === 1 && m.awayGoals === 2, `${m.homeGoals}-${m.awayGoals}`);
    const drain = await runEagerDrain();
    check("eager drain ran (details fetched)", drain.matches >= 1);
    const r = await runPushNotify();
    check("full-time push fired (the late goal too)", r.fired >= 1, `fired=${r.fired}`);
    check("4 events stored after drain", (await db.select().from(matchEvents).where(eq(matchEvents.matchId, m.id))).length === 4);
  });

  console.log(`\n${failures === 0 ? "✓ ALL CHECKS PASSED" : `✗ ${failures} CHECK(S) FAILED`}`);
  if (!KEEP) {
    await cleanup();
    console.log("cleaned up the fake match.");
  } else {
    console.log("kept the fake match in local.db (--keep). It is now FT 1-2.");
  }
  process.exit(failures === 0 ? 0 : 1);
}

void main();
