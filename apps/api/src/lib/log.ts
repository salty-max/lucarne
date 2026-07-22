/**
 * Tiny structured logger. Zero dependencies, two output formats:
 *   - "json"   — one JSON line per event (default). Structured, greppable in
 *                the run_log table, parseable by any log sink. Used on Workers.
 *   - "pretty" — a colourised human line for a terminal. The Node entry opts
 *                into this (see server.ts).
 * Prefer stable dotted tags ("live.polled", "details.eager") + a context object
 * over interpolated strings. Level threshold + format are set via env at startup
 * (Node) or per-invocation (Workers), mirroring setDb.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFormat = "pretty" | "json";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold = ORDER.info;
let format: LogFormat = "json"; // structured by default; the Node terminal opts into "pretty"

/** Set the minimum level to emit. Unknown/empty values leave it unchanged. */
export function setLogLevel(level: string | undefined | null): void {
  if (level && level in ORDER) threshold = ORDER[level as LogLevel];
}

/** Set the output format. Unknown/empty values leave it unchanged. */
export function setLogFormat(fmt: string | undefined | null): void {
  if (fmt === "pretty" || fmt === "json") format = fmt;
}

// ANSI — only ever emitted in "pretty" mode (a real terminal).
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: "\x1b[90m", // grey
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};

function renderValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === null || typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function pretty(level: LogLevel, tag: string, ctx?: Record<string, unknown>): string {
  const time = new Date().toISOString().slice(11, 19); // HH:MM:SS (UTC)
  const lvl = `${LEVEL_COLOR[level]}${level.toUpperCase().padEnd(5)}${RESET}`;
  const kv = ctx
    ? Object.entries(ctx)
        .map(([k, v]) => `${DIM}${k}=${RESET}${renderValue(v)}`)
        .join(" ")
    : "";
  return `${DIM}${time}${RESET} ${lvl} ${BOLD}${tag}${RESET}${kv ? `  ${kv}` : ""}`;
}

function emit(level: LogLevel, tag: string, ctx?: Record<string, unknown>): void {
  if (ORDER[level] < threshold) return;
  const line =
    format === "pretty"
      ? pretty(level, tag, ctx)
      : JSON.stringify({ t: new Date().toISOString(), level, tag, ...ctx });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (tag: string, ctx?: Record<string, unknown>) => emit("debug", tag, ctx),
  info: (tag: string, ctx?: Record<string, unknown>) => emit("info", tag, ctx),
  warn: (tag: string, ctx?: Record<string, unknown>) => emit("warn", tag, ctx),
  error: (tag: string, ctx?: Record<string, unknown>) => emit("error", tag, ctx),
};
