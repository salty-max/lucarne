import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscription } from "@/db/schema";
import { log } from "@/lib/log";
import { sendPush, type PushSub, type Vapid } from "@/lib/webpush";

export type PushTrigger = "goal" | "yellow" | "red" | "kickoff" | "ft";
export const ALL_TRIGGERS: PushTrigger[] = ["goal", "yellow", "red", "kickoff", "ft"];

/** VAPID config from the environment, or null if push isn't set up. */
export function getVapid(): Vapid | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

/** Store (or refresh) a browser's subscription + who it wants to hear about. */
export async function saveSubscription(
  sub: PushSub,
  teams: string[],
  triggers: PushTrigger[],
): Promise<void> {
  await db
    .insert(pushSubscription)
    .values({
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      teams,
      triggers,
    })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, teams, triggers },
    });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscription).where(inArray(pushSubscription.endpoint, [endpoint]));
}

/** One-off confirmation push, so enabling notifications proves the whole chain
 *  (encryption → push service → SW) end-to-end straight away. Best-effort. */
export async function sendWelcome(sub: PushSub): Promise<void> {
  const vapid = getVapid();
  if (!vapid) return;
  try {
    await sendPush(sub, { title: "Lucarne", body: "Notifications activées ✓", tag: "welcome" }, vapid, 60);
  } catch {
    /* best effort */
  }
}

export type PushPayload = {
  title: string;
  body: string;
  matchId: number;
  tag?: string; // coalesce related notifications (e.g. one per match)
};

/**
 * Fan a notification out to every subscription that follows one of `teams` and
 * opted into `trigger`. Dead subscriptions (404/410) are pruned. Returns how many
 * pushes were accepted by the push services.
 */
export async function deliver(
  payload: PushPayload,
  opts: { teams: string[]; trigger: PushTrigger },
): Promise<number> {
  const vapid = getVapid();
  if (!vapid) return 0;
  const teamSet = new Set(opts.teams);
  const subs = await db.select().from(pushSubscription);
  const targets = subs.filter(
    (s) => s.triggers.includes(opts.trigger) && s.teams.some((t) => teamSet.has(t)),
  );
  if (targets.length === 0) return 0;

  let sent = 0;
  const dead: string[] = [];
  for (const s of targets) {
    try {
      const r = await sendPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        vapid,
        payload.tag === "ft" ? 3600 : 120,
      );
      if (r.ok) sent++;
      else if (r.gone) dead.push(s.endpoint);
      else log.warn("push.send.failed", { status: r.status, endpoint: s.endpoint.slice(0, 40) });
    } catch (err) {
      log.warn("push.send.error", { err: String(err) });
    }
  }
  if (dead.length > 0) {
    await db.delete(pushSubscription).where(inArray(pushSubscription.endpoint, dead));
  }
  return sent;
}
