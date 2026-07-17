import { Hono } from "hono";
import { and, asc, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { competitions, matches } from "@/db/schema";
import { runSeed } from "@/db/seed-data";
import { authorizeCron } from "@/lib/auth";
import { COMPETITIONS } from "@/lib/competitions";
import { candidateKickoffRange } from "@/lib/live";
import { getCompetitionDetail } from "@/lib/competition";
import {
  runDetailsDrain,
  runFixtureSync,
  runFullResync,
  runLineupPoll,
  runLivePollTick,
} from "@/lib/poller";
import { pickCache } from "@/lib/scheduleCache";
import { getMatchDetail, getSchedule, toWire, toWireMatchDetail } from "@/lib/schedule";
import { startOfParisDay } from "@/lib/time";
import type {
  CompetitionDetailResponse,
  CompetitionsResponse,
  MatchDetailResponse,
  ScheduleResponse,
} from "@lucarne/shared";

// Portable Hono JSON API — runs on both the Node server and Cloudflare Workers.
// The React SPA (apps/web) is served separately by Static Assets / Node static.
export const app = new Hono();

// --- schedule grouped by Paris day. Query: ?from=YYYY-MM-DD&days=N&competition=slug
app.get("/api/schedule", async (c) => {
  try {
    const fromParam = c.req.query("from");
    const daysParam = c.req.query("days");
    const competition = c.req.query("competition") || undefined;
    // Paris midnight of `from` (noon avoids DST edges); defaults to today.
    const from = fromParam ? startOfParisDay(new Date(`${fromParam}T12:00:00Z`)) : undefined;
    const days = daysParam ? Number(daysParam) : undefined;
    const body: ScheduleResponse = {
      days: toWire(await getSchedule({ from, days, competition })),
    };
    return c.json(body);
  } catch (err) {
    console.error("[/api/schedule]", err);
    return c.json({ days: [] } satisfies ScheduleResponse);
  }
});

// --- one match by id, with detail-page extras (venue/round/timeline) ---
app.get("/api/match/:id", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ match: null } satisfies MatchDetailResponse, 400);
    const m = await getMatchDetail(id);
    return c.json({ match: m ? toWireMatchDetail(m) : null } satisfies MatchDetailResponse);
  } catch (err) {
    console.error("[/api/match]", err);
    return c.json({ match: null } satisfies MatchDetailResponse);
  }
});

// --- the tracked competitions (for the Competitions view / nav) ---
app.get("/api/competitions", async (c) => {
  try {
    const rows = await db
      .select({
        slug: competitions.slug,
        name: competitions.name,
        type: competitions.type,
        country: competitions.country,
      })
      .from(competitions)
      .orderBy(asc(competitions.id));
    // Present them in the catalogue's order (so Ligue 2 sits next to Ligue 1),
    // not DB-insertion order.
    const order = new Map(COMPETITIONS.map((cc, i) => [cc.slug, i]));
    rows.sort((a, b) => (order.get(a.slug) ?? 999) - (order.get(b.slug) ?? 999));
    return c.json({ competitions: rows } satisfies CompetitionsResponse);
  } catch (err) {
    console.error("[/api/competitions]", err);
    return c.json({ competitions: [] } satisfies CompetitionsResponse);
  }
});

// --- one competition's tables + knockout bracket (for the Competition view) ---
app.get("/api/competition/:slug", async (c) => {
  try {
    const competition = await getCompetitionDetail(c.req.param("slug"));
    return c.json({ competition } satisfies CompetitionDetailResponse);
  } catch (err) {
    console.error("[/api/competition]", err);
    return c.json({ competition: null } satisfies CompetitionDetailResponse);
  }
});

// --- live scores JSON: read from OUR db, polled by the browser (no API cost) ---
app.get("/api/live", async (c) => {
  try {
    const { earliest, latest } = candidateKickoffRange(Date.now());
    const rows = await db
      .select({
        id: matches.id,
        status: matches.status,
        elapsed: matches.elapsed,
        homeGoals: matches.homeGoals,
        awayGoals: matches.awayGoals,
        homePenalties: matches.homePenalties,
        awayPenalties: matches.awayPenalties,
      })
      .from(matches)
      .where(
        and(
          gte(matches.kickoff, earliest),
          lte(matches.kickoff, latest),
          inArray(matches.status, ["live", "finished"]),
        ),
      );
    return c.json({ matches: rows });
  } catch (err) {
    console.error("[/api/live]", err);
    return c.json({ matches: [] });
  }
});

// --- cron endpoints (authed). Optional: only needed for serverless deploys or
//     manual triggering. The Node in-process scheduler calls the same logic. ---
app.get("/api/cron/fixtures", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json({ ok: true, ...(await runFixtureSync(pickCache(c.env))) });
  } catch (err) {
    console.error("[cron/fixtures]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

app.get("/api/cron/live", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json(await runLivePollTick(new Date(), pickCache(c.env)));
  } catch (err) {
    console.error("[cron/live]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

app.get("/api/cron/lineups", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json({ ok: true, ...(await runLineupPoll()) });
  } catch (err) {
    console.error("[cron/lineups]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

app.get("/api/cron/details", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json({ ok: true, ...(await runDetailsDrain()) });
  } catch (err) {
    console.error("[cron/details]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// Force the weekly full-season fixture re-sync on demand (also usable to pull a
// competition's whole calendar after a draw). Standings ride the daily sync.
app.get("/api/cron/resync", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json({ ok: true, ...(await runFullResync(pickCache(c.env))) });
  } catch (err) {
    console.error("[cron/resync]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// Idempotent reference-data seed (broadcasters/competitions/rules). Authed —
// run once after a D1 deploy, or again after updating the seed each season.
app.post("/api/admin/seed", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json({ ok: true, ...(await runSeed(db)) });
  } catch (err) {
    console.error("[admin/seed]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// One-time backfill of post-match details across the FULL backlog (not just the
// last few days). Budget-gated + subrequest-capped, so call repeatedly until
// `matches` comes back 0 — useful after seeding a whole tournament's history.
app.post("/api/admin/backfill-details", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json({ ok: true, ...(await runDetailsDrain(50, { sinceDays: null })) });
  } catch (err) {
    console.error("[admin/backfill-details]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});
