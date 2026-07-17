/**
 * All user-facing dates are rendered in Europe/Paris regardless of server tz.
 */
export const PARIS_TZ = "Europe/Paris";

/** YYYY-MM-DD in Paris local time — used to group matches into day sections. */
export function parisDayKey(d: Date): string {
  // en-CA gives ISO-like YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** "Saturday 16 August" style heading. */
export function parisDayLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

/** "21:00" kickoff time in Paris. */
export function parisTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS_TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** YYYY-MM-DD for API query params (UTC calendar day). */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/** UTC instant of the most recent Paris-local midnight (DST-safe). */
export function startOfParisDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS_TZ,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const secondsIntoDay = get("hour") * 3600 + get("minute") * 60 + get("second");
  return new Date(now.getTime() - secondsIntoDay * 1000);
}
