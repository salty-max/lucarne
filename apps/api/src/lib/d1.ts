/**
 * D1 allows at most **100 bound parameters per query**, and Drizzle emits one
 * placeholder per column per row in a multi-row INSERT — so a 19-event match
 * (10 columns) is already 190 parameters and fails outright.
 *
 * bun:sqlite allows 32,766, which is exactly why oversized statements pass in
 * development and only break in production. Every bulk write and every
 * `inArray(...)` therefore has to be split through here.
 *
 * See https://developers.cloudflare.com/d1/platform/limits/
 */
export const D1_MAX_PARAMS = 100;

function split<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Split rows so each INSERT stays under the parameter ceiling.
 * `columnsPerRow` is how many columns the insert actually binds.
 */
export function chunkRows<T>(rows: readonly T[], columnsPerRow: number): T[][] {
  const perStatement = Math.max(1, Math.floor(D1_MAX_PARAMS / Math.max(1, columnsPerRow)));
  return split(rows, perStatement);
}

/**
 * Split ids for an `inArray(...)` filter — one bound parameter each. `reserved`
 * is how many parameters the rest of the WHERE clause already spends, so the
 * whole statement stays under the ceiling.
 */
export function chunkIds<T>(ids: readonly T[], reserved = 0): T[][] {
  return split(ids, Math.max(1, D1_MAX_PARAMS - reserved));
}
