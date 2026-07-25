import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { chunkIds } from "@/lib/d1";
import { pushSubscription } from "@/db/schema";
import { log } from "@/lib/log";
import { sendPush, type PushSub, type Vapid } from "@/lib/webpush";

export type PushTrigger =
  | "goal"
  | "yellow"
  | "red"
  | "lineups"
  | "kickoff"
  | "ft"
  | "ht" // half-time
  | "phase" // extra time / penalty shootout starting
  | "motm" // man of the match (post-match)
  | "subst"; // substitution(s), batched per team+minute
export const ALL_TRIGGERS: PushTrigger[] = [
  "goal",
  "yellow",
  "red",
  "lineups",
  "kickoff",
  "ft",
  "ht",
  "phase",
  "motm",
  "subst",
];

/**
 * Per-trigger message lifetime (seconds), handed to the push service as the RFC
 * 8030 TTL. This is the single most important knob for actually RECEIVING a
 * notification: a phone that's asleep, in low-power mode or off-network only
 * picks its messages up when it wakes, and APNs/FCM silently DROP anything whose
 * TTL has run out in the meantime. So each trigger gets the window over which its
 * message is still worth reading:
 *   - in-play facts (goals, cards, phases) stay true for the rest of the match;
 *   - the pre-kickoff reminder is pointless once the match has started;
 *   - full-time and man-of-the-match are worth an hour.
 * (Before this, every push shipped a flat 120 s — anything the phone didn't pick
 * up within two minutes was thrown away, which is exactly how kick-off and
 * full-time notifications went missing.)
 */
const TTL_SECONDS: Record<PushTrigger, number> = {
  lineups: 30 * 60, // useful right up to kickoff
  kickoff: 10 * 60, // "starts in ~10 min" — moot after that
  goal: 60 * 60,
  yellow: 60 * 60,
  red: 60 * 60,
  subst: 30 * 60,
  ht: 30 * 60,
  phase: 30 * 60,
  ft: 60 * 60,
  motm: 60 * 60,
};

/** How long the push service may hold this trigger's message (seconds). The map
 *  is a total `Record<PushTrigger, …>`, so a new trigger can't silently ship
 *  without one. */
export function pushTtl(trigger: PushTrigger): number {
  return TTL_SECONDS[trigger];
}

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

/**
 * Hosts the browser push services actually hand out. `/api/push/subscribe` is
 * unauthenticated by design, and whatever endpoint it stores is later POSTed to
 * on every match event — so without this the service would happily be pointed at
 * any URL and turned into an outbound request engine.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome / Chromium
  "android.googleapis.com", // legacy GCM
  ".push.apple.com", // Safari, iOS
  "updates.push.services.mozilla.com", // Firefox
  ".notify.windows.com", // Edge / Windows
  ".push.microsoft.com",
];

/** True if `endpoint` is an https URL belonging to a known push service. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h));
}

/** Store (or refresh) a browser's subscription, linked to its device. Push now
 *  targets the matches a device surveils (watched_match ∪ followed_team), so the
 *  legacy `teams` column is left empty. */
export async function saveSubscription(
  sub: PushSub,
  deviceId: string | null,
  triggers: PushTrigger[],
): Promise<void> {
  await db
    .insert(pushSubscription)
    .values({
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      deviceId,
      teams: [],
      triggers,
    })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, deviceId, triggers },
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
    await sendPush(
      sub,
      { title: "Lucarne", body: "Notifications activées ✓", tag: "welcome" },
      vapid,
      { ttl: 60, urgency: "high" },
    );
  } catch {
    /* best effort */
  }
}

export type PushPayload = {
  title: string;
  body: string;
  matchId: number;
  /** Notification tag. Notifications sharing a tag REPLACE each other in the
   *  tray, so this is unique per event — one tag per match would mean full-time
   *  being silently swallowed by the man-of-the-match push that follows it. */
  tag?: string;
};

/**
 * What a fan-out actually achieved. `targets` (how many subscriptions we tried)
 * is what lets the caller tell "nobody to notify" from "everybody failed" — the
 * first is final, the second deserves a retry on the next tick.
 */
export type DeliveryResult = {
  sent: number; // pushes the push services accepted
  targets: number; // subscriptions we attempted
};

/**
 * Fan a notification out to every subscription whose DEVICE surveils this match
 * and opted into `trigger`. Dead subscriptions (404/410) are pruned.
 */
export async function deliver(
  payload: PushPayload,
  opts: { deviceIds: Set<string>; trigger: PushTrigger },
): Promise<DeliveryResult> {
  const vapid = getVapid();
  if (!vapid) return { sent: 0, targets: 0 };
  const subs = await db.select().from(pushSubscription);
  const targets = subs.filter(
    (s) => s.deviceId != null && opts.deviceIds.has(s.deviceId) && s.triggers.includes(opts.trigger),
  );
  if (targets.length === 0) return { sent: 0, targets: 0 };

  let sent = 0;
  const dead: string[] = [];
  for (const s of targets) {
    try {
      const r = await sendPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        vapid,
        // Live football is worthless late: ask for immediate delivery, and give
        // the message a lifetime that matches how long it stays interesting.
        { ttl: pushTtl(opts.trigger), urgency: "high" },
      );
      if (r.ok) sent++;
      else if (r.gone) dead.push(s.endpoint);
      else log.warn("push.send.failed", { status: r.status, endpoint: s.endpoint.slice(0, 40) });
    } catch (err) {
      log.warn("push.send.error", { err: String(err) });
    }
  }
  for (const slice of chunkIds(dead)) {
    await db.delete(pushSubscription).where(inArray(pushSubscription.endpoint, slice));
  }
  // A subscription the push service has dropped is not a failure to retry — it's
  // gone. Don't count it as a target, or its match's notifications would be
  // re-attempted every tick for nobody.
  return { sent, targets: targets.length - dead.length };
}
