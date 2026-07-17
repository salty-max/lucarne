import type { DateFormat } from "./settings";

const PARIS = "Europe/Paris";
const localeFor = (f: DateFormat) => (f === "mdy" ? "en-US" : "en-GB");

/** A YYYY-MM-DD day key → a Date pinned to Paris midday (TZ-edge safe). */
export function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** DD/MM/YYYY in Paris. */
function numeric(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

/** Long heading, e.g. "Thursday 16 July" / "Thursday, July 16" / "16/07/2026". */
export function formatLong(d: Date, f: DateFormat): string {
  if (f === "numeric") return numeric(d);
  return new Intl.DateTimeFormat(localeFor(f), {
    timeZone: PARIS,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

/** Short label, e.g. "Fri 17 Jul" / "Fri, Jul 17" / "17/07/2026". */
export function formatShort(d: Date, f: DateFormat): string {
  if (f === "numeric") return numeric(d);
  return new Intl.DateTimeFormat(localeFor(f), {
    timeZone: PARIS,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

/** Weekday abbreviation for the calendar day strip (format-independent). */
export function weekdayShort(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: PARIS, weekday: "short" }).format(d);
}
