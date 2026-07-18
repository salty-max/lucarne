/**
 * Tiny structured logger. Zero dependencies, identical on Node and Workers — it
 * just prints one JSON line per event, so the output is greppable in `wrangler
 * tail` and parseable by any log sink. Prefer stable dotted tags ("live.polled",
 * "details.eager") + a context object over interpolated strings.
 *
 * The level threshold defaults to "info"; call `setLogLevel(env.LOG_LEVEL)` once
 * at startup (Node) or per-invocation (Workers, mirroring setDb) to change it.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold = ORDER.info;

/** Set the minimum level to emit. Unknown/empty values leave it unchanged. */
export function setLogLevel(level: string | undefined | null): void {
  if (level && level in ORDER) threshold = ORDER[level as LogLevel];
}

function emit(level: LogLevel, tag: string, ctx?: Record<string, unknown>): void {
  if (ORDER[level] < threshold) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, tag, ...ctx });
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
