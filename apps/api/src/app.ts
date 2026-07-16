import { Hono } from "hono";
import { and, asc, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { competitions, matches } from "@/db/schema";
import { runSeed } from "@/db/seed-data";
import { authorizeCron } from "@/lib/auth";
import { candidateKickoffRange } from "@/lib/live";
import { runDetailsDrain, runFixtureSync, runLivePollTick } from "@/lib/poller";
import { pickCache } from "@/lib/scheduleCache";
import { getSchedule, toWire } from "@/lib/schedule";
import { startOfParisDay } from "@/lib/time";
import type { CompetitionsResponse, ScheduleResponse } from "@lucarne/shared";

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
    return c.json({ competitions: rows } satisfies CompetitionsResponse);
  } catch (err) {
    console.error("[/api/competitions]", err);
    return c.json({ competitions: [] } satisfies CompetitionsResponse);
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

app.get("/api/cron/details", async (c) => {
  if (!authorizeCron(c.req.raw)) return c.text("Unauthorized", 401);
  try {
    return c.json({ ok: true, ...(await runDetailsDrain()) });
  } catch (err) {
    console.error("[cron/details]", err);
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
