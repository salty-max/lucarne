/** Column arithmetic. Everything on a teletext page is aligned to a fixed grid,
 *  so a single mis-measured string shifts an entire column — worth being exact
 *  rather than trusting String.length. */

/** Display width of one code point. Combining marks occupy no column of their
 *  own; CJK and fullwidth forms occupy two. */
function charWidth(cp: number): number {
  // Combining diacriticals and friends — "e" + U+0301 must measure 1, not 2.
  if (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe20 && cp <= 0xfe2f)
  ) {
    return 0;
  }
  if (cp === 0x200b || cp === 0xfeff) return 0; // zero-width space / BOM
  // East Asian Wide and Fullwidth ranges, plus emoji that render double.
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff)
  ) {
    return 2;
  }
  return 1;
}

export function width(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch.codePointAt(0)!);
  return w;
}

/** Cut to `max` columns. Never splits a surrogate pair or orphans a combining
 *  mark, and stops short rather than overshooting on a wide character. */
export function truncate(s: string, max: number): string {
  if (max <= 0) return "";
  if (width(s) <= max) return s;
  let out = "";
  let w = 0;
  for (const ch of s) {
    const cw = charWidth(ch.codePointAt(0)!);
    if (w + cw > max) break;
    out += ch;
    w += cw;
  }
  return out;
}

/** Truncate, and mark that it happened — a silently cut team name reads as a
 *  different team. */
export function ellipsis(s: string, max: number): string {
  if (max <= 0) return "";
  if (width(s) <= max) return s;
  if (max === 1) return "…";
  return truncate(s, max - 1) + "…";
}

export function padEnd(s: string, max: number): string {
  const t = truncate(s, max);
  return t + " ".repeat(Math.max(0, max - width(t)));
}

export function padStart(s: string, max: number): string {
  const t = truncate(s, max);
  return " ".repeat(Math.max(0, max - width(t))) + t;
}

export function centre(s: string, max: number): string {
  const t = truncate(s, max);
  const slack = Math.max(0, max - width(t));
  const left = Math.floor(slack / 2);
  return " ".repeat(left) + t + " ".repeat(slack - left);
}

/** Teletext is upper-case throughout. French accents uppercase cleanly and stay
 *  one column wide, so this is safe for team and competition names. */
export function upper(s: string): string {
  return s.toLocaleUpperCase("fr-FR");
}
