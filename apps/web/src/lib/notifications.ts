// Client side of Web Push: request permission, (de)register the browser's
// subscription (linked to its deviceId), and mirror followed teams to the server.
// The user opted into every event kind, so we send the full trigger set.
import { getDeviceId } from "@/lib/device";

const TRIGGERS = ["goal", "yellow", "red", "lineups", "kickoff", "ft"];

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): NotificationPermission | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

function urlB64ToU8(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function postSubscribe(sub: PushSubscription, welcome = false): Promise<void> {
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), deviceId: getDeviceId(), triggers: TRIGGERS, welcome }),
  });
}

/** Mirror the followed teams to the server (per device). Drives auto-surveillance
 *  — live enrichment + push — independently of notification permission. */
export async function syncFollows(teams: string[]): Promise<void> {
  await fetch("/api/follows", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: getDeviceId(), teams }),
  }).catch(() => {});
}

/** Ask permission, subscribe, and register with the API. Returns false if the
 *  browser can't (unsupported, permission denied, or push not configured). */
export async function enablePush(teams: string[]): Promise<boolean> {
  if (!pushSupported()) return false;
  if ((await Notification.requestPermission()) !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const res = await fetch("/api/push/key");
    if (!res.ok) return false;
    const { key } = (await res.json()) as { key: string | null };
    if (!key) return false;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToU8(key),
    });
  }
  await postSubscribe(sub, true);
  await syncFollows(teams);
  return true;
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

/** If already subscribed, re-register so the subscription is linked to this
 *  device (push targets the matches a device surveils). Cheap idempotent upsert;
 *  run on load to migrate subscriptions made before the teams→device switch. */
export async function resyncPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await postSubscribe(sub);
}
