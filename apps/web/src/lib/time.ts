const PARIS = "Europe/Paris";

/** "21:00" kickoff time (Paris, 24h). */
export function parisTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** YYYY-MM-DD for the given date in Paris (matches the API's day keys). */
export function parisDayKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PARIS }).format(d);
}

/** "Thursday 16 July" heading. */
export function parisLongLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

/** Minute label for a match event, e.g. "45+2'". */
export function eventMinute(minute: number | null, extra: number | null): string {
  if (minute == null) return "";
  return `${minute}${extra ? "+" + extra : ""}'`;
}
