import { Hono } from "hono";
import { and, asc, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { competitions, matches, teams } from "@/db/schema";
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
import { recentRuns } from "@/lib/runlog";
import {
  ALL_TRIGGERS,
  removeSubscription,
  saveSubscription,
  sendWelcome,
  vapidPublicKey,
  type PushTrigger,
} from "@/lib/push";
import { pickCache } from "@/lib/scheduleCache";
import { getMatchDetail, getSchedule, toWire, toWireMatchDetail } from "@/lib/schedule";
import { startOfParisDay } from "@/lib/time";
import type {
  CompetitionDetailResponse,
  CompetitionsResponse,
  LogsResponse,
  MatchDetailResponse,
  RunLogEntry,
  ScheduleResponse,
  TeamsResponse,
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

// All known teams (name + short name), for the "My teams" follow picker.
app.get("/api/teams", async (c) => {
  try {
    const rows = await db
      .select({ name: teams.name, shortName: teams.shortName })
      .from(teams)
      .orderBy(asc(teams.name));
    return c.json({ teams: rows } satisfies TeamsResponse);
  } catch (err) {
    console.error("[/api/teams]", err);
    return c.json({ teams: [] } satisfies TeamsResponse, 500);
  }
});

// --- Web Push: the client fetches the VAPID public key, then registers /
//     deregisters its browser subscription (with the teams it wants alerts for). ---
app.get("/api/push/key", (c) => {
  const key = vapidPublicKey();
  return key ? c.json({ key }) : c.json({ key: null }, 503);
});

app.post("/api/push/subscribe", async (c) => {
  try {
    const body = (await c.req.json()) as {
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      teams?: unknown;
      triggers?: unknown;
      welcome?: boolean;
    };
    const sub = body.subscription;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return c.json({ ok: false, error: "bad subscription" }, 400);
    }
    const teams = Array.isArray(body.teams)
      ? body.teams.filter((t): t is string => typeof t === "string")
      : [];
    const triggers = Array.isArray(body.triggers)
      ? body.triggers.filter((t): t is PushTrigger => (ALL_TRIGGERS as string[]).includes(t as string))
      : ALL_TRIGGERS;
    const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
    await saveSubscription(pushSub, teams, triggers);
    if (body.welcome) await sendWelcome(pushSub);
    return c.json({ ok: true });
  } catch (err) {
    console.error("[/api/push/subscribe]", err);
    return c.json({ ok: false }, 500);
  }
});

app.post("/api/push/unsubscribe", async (c) => {
  try {
    const body = (await c.req.json()) as { endpoint?: string };
    if (body.endpoint) await removeSubscription(body.endpoint);
    return c.json({ ok: true });
  } catch (err) {
    console.error("[/api/push/unsubscribe]", err);
    return c.json({ ok: false }, 500);
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

// Recent scheduled-job history (newest first) from run_log — the queryable cron
// audit trail behind the P800 logs page. Read-only, so public like the other
// read endpoints (no side effects, no secrets — detail is job counts + errors).
// `?limit=N` (default 100, capped at 200).
app.get("/api/logs", async (c) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit")) || 100));
    const runs: RunLogEntry[] = (await recentRuns(limit)).map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      job: r.job,
      ok: r.ok,
      detail: r.detail,
      ms: r.ms,
    }));
    return c.json({ ok: true, runs } satisfies LogsResponse);
  } catch (err) {
    console.error("[logs]", err);
    return c.json({ ok: false, runs: [] } satisfies LogsResponse, 500);
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
    return c.json({ ok: true, ...(await runDetailsDrain(50, { sinceMs: null })) });
  } catch (err) {
    console.error("[admin/backfill-details]", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});
