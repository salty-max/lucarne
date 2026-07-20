import { bg, fg, RESET, TT, type Colour } from "@/render/colors";
import { truncate, width as strWidth } from "@/render/text";

/** Teletext is 40 columns by 24 rows. Keeping that exactly — rather than
 *  filling whatever terminal it lands in — is the whole point: the constraint is
 *  what makes the layout read as teletext. Wider terminals get the page centred. */
export const COLS = 40;
export const ROWS = 24;

type Cell = { ch: string; f: Colour; b: Colour };

const BLANK: Cell = { ch: " ", f: TT.white, b: TT.black };

function blankGrid(): Cell[] {
  return Array.from({ length: COLS * ROWS }, () => ({ ...BLANK }));
}

export class Screen {
  private cells: Cell[] = blankGrid();
  /** Last painted frame, so render() can emit only what moved. null forces a
   *  full repaint — used on first draw and after a resize. */
  private prev: Cell[] | null = null;

  clear(f: Colour = TT.white, b: Colour = TT.black): void {
    for (const c of this.cells) {
      c.ch = " ";
      c.f = f;
      c.b = b;
    }
  }

  /** Anything drawn outside the grid is dropped rather than wrapping — a string
   *  one column too long should lose its tail, not reappear on the next line. */
  put(x: number, y: number, text: string, f: Colour = TT.white, b: Colour = TT.black): void {
    if (y < 0 || y >= ROWS || x >= COLS) return;
    let cx = x;
    for (const ch of truncate(text, COLS - x)) {
      if (cx >= COLS) break;
      if (cx >= 0) {
        const cell = this.cells[y * COLS + cx]!;
        cell.ch = ch;
        cell.f = f;
        cell.b = b;
      }
      cx += strWidth(ch);
    }
  }

  fill(x: number, y: number, w: number, h: number, b: Colour, ch = " "): void {
    for (let row = y; row < y + h; row++) {
      if (row < 0 || row >= ROWS) continue;
      for (let col = x; col < x + w; col++) {
        if (col < 0 || col >= COLS) continue;
        const cell = this.cells[row * COLS + col]!;
        cell.ch = ch;
        cell.b = b;
        if (ch !== " ") cell.f = b;
      }
    }
  }

  /** Solid colour band — the teletext section header. */
  band(y: number, b: Colour): void {
    this.fill(0, y, COLS, 1, b);
  }

  invalidate(): void {
    this.prev = null;
  }

  /** Emit the ANSI needed to bring the terminal from the last frame to this one.
   *  Only changed runs are written, so a live score updating every few seconds
   *  repaints two cells rather than a thousand — no flicker, no tearing. */
  render(termCols: number, termRows: number): string {
    const offX = Math.max(0, Math.floor((termCols - COLS) / 2));
    const offY = Math.max(0, Math.floor((termRows - ROWS) / 2));
    const full = this.prev === null;
    let out = "";

    for (let y = 0; y < ROWS; y++) {
      let x = 0;
      while (x < COLS) {
        const i = y * COLS + x;
        const cell = this.cells[i]!;
        const old = this.prev?.[i];
        if (!full && old && old.ch === cell.ch && old.f === cell.f && old.b === cell.b) {
          x++;
          continue;
        }

        // Start of a changed run: position once, then walk it.
        out += `\x1b[${offY + y + 1};${offX + x + 1}H`;
        let curF: Colour | null = null;
        let curB: Colour | null = null;
        while (x < COLS) {
          const j = y * COLS + x;
          const c = this.cells[j]!;
          const o = this.prev?.[j];
          if (!full && o && o.ch === c.ch && o.f === c.f && o.b === c.b) break;
          if (c.f !== curF || c.b !== curB) {
            out += fg(c.f) + bg(c.b);
            curF = c.f;
            curB = c.b;
          }
          out += c.ch;
          x++;
        }
        out += RESET;
      }
    }

    this.prev = this.cells.map((c) => ({ ...c }));
    return out;
  }

  /** Plain text of the current grid, for tests and snapshots. */
  toText(): string {
    const lines: string[] = [];
    for (let y = 0; y < ROWS; y++) {
      let line = "";
      for (let x = 0; x < COLS; x++) line += this.cells[y * COLS + x]!.ch;
      lines.push(line.replace(/\s+$/, ""));
    }
    return lines.join("\n");
  }

  /** Colour of one cell, for tests. */
  at(x: number, y: number): Cell {
    return this.cells[y * COLS + x]!;
  }
}
