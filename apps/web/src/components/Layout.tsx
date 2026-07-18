import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCompetitions } from "@/hooks/useCompetitions";
import { useLiveCount } from "@/hooks/useLiveCount";
import { LiveDot } from "@/components/common";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { formatShort } from "@/lib/dates";
import {
  FASTTEXT,
  FOOTER_MORE,
  PAGE_ORDER,
  pageNoForPath,
  routeForPageNo,
  sectionOf,
} from "@/lib/teletext";

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Europe/Paris",
});

export function Layout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const comps = useCompetitions();
  const live = useLiveCount();
  const { dateFormat, lang } = useSettings();
  const t = useT();

  const [now, setNow] = useState(() => new Date());
  const [entry, setEntry] = useState("");
  const entryRef = useRef("");
  const clearId = useRef<number | undefined>(undefined);

  // Live clock in the service line.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Keep the freshest nav inputs for the (stable) keyboard listener.
  const ctx = useRef({ comps, pathname, lang });
  ctx.current = { comps, pathname, lang };

  // Keep the freshest navigate for the once-attached global listener.
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const mainRef = useRef<HTMLElement>(null);
  const cursorRef = useRef<HTMLElement | null>(null);

  // Teletext keyboard: page number, ◄ ► page, Backspace back, R/G/Y/C keys.
  useEffect(() => {
    const go = (to: string) => navRef.current({ to });
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (/^[0-9]$/.test(e.key)) {
        const next = (entryRef.current + e.key).slice(-3);
        entryRef.current = next;
        setEntry(next);
        window.clearTimeout(clearId.current);
        if (next.length === 3) {
          const to = routeForPageNo(next, ctx.current.comps);
          if (to) go(to);
          entryRef.current = "";
          clearId.current = window.setTimeout(() => setEntry(""), 220);
        } else {
          clearId.current = window.setTimeout(() => {
            entryRef.current = "";
            setEntry("");
          }, 1200);
        }
        e.preventDefault();
        return;
      }

      if (e.key === "Backspace") {
        window.history.back();
        e.preventDefault();
        return;
      }

      // Arrows move a highlighted cursor through the page's items (terminal-
      // style) — no browser focus, and they never switch pages.
      if (e.key.startsWith("Arrow")) {
        const main = mainRef.current;
        if (!main) return;
        const items = Array.from(
          main.querySelectorAll<HTMLElement>("[data-nav],a[href],button:not([disabled])"),
        ).filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
        const cur = cursorRef.current ? items.indexOf(cursorRef.current) : -1;
        const next =
          cur === -1 ? (dir === 1 ? 0 : items.length - 1) : (cur + dir + items.length) % items.length;
        cursorRef.current?.classList.remove("tt-cur");
        const el = items[next];
        el.classList.add("tt-cur");
        el.scrollIntoView({ block: "nearest" });
        cursorRef.current = el;
        e.preventDefault();
        return;
      }

      if (e.key === "Enter") {
        cursorRef.current?.click();
        e.preventDefault();
        return;
      }

      const fast = FASTTEXT.find((f) => f.key[ctx.current.lang] === e.key.toLowerCase());
      if (fast) {
        go(fast.to);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Drop the cursor highlight when the page changes.
  useEffect(() => {
    cursorRef.current?.classList.remove("tt-cur");
    cursorRef.current = null;
  }, [pathname]);

  const pageNo = pageNoForPath(pathname, comps);

  return (
    <div className="tt-stage">
      <div className="tt-tv">
        <div className="tt-screen">
          {/* Service line */}
          <div className="tt-service">
            <span className="pnum">P{pageNo}</span>
            <Link to="/" className="svc">
              LUCARNE
            </Link>
            {live > 0 && (
              <span className="flex items-center gap-1 text-live">
                <LiveDot />
                {live}
              </span>
            )}
            <span className="sp flex-1" />
            <span className="entry">{entry ? `${entry}▌` : ""}</span>
            <span className="hidden text-muted-foreground sm:inline">
              {formatShort(now, dateFormat, lang).toUpperCase()}
            </span>
            <span className="clk">{timeFmt.format(now)}</span>
            <span className="ml-1 inline-flex gap-0.5">
              <button
                className="tt-navbtn"
                aria-label={t.kbd.prevPage}
                onClick={() => {
                  const i = PAGE_ORDER.indexOf(sectionOf(pathname));
                  navigate({ to: PAGE_ORDER[(i - 1 + PAGE_ORDER.length) % PAGE_ORDER.length] });
                }}
              >
                ◄
              </button>
              <button
                className="tt-navbtn"
                aria-label={t.kbd.nextPage}
                onClick={() => {
                  const i = PAGE_ORDER.indexOf(sectionOf(pathname));
                  navigate({ to: PAGE_ORDER[(i + 1) % PAGE_ORDER.length] });
                }}
              >
                ►
              </button>
            </span>
          </div>

          {/* Routed page — scrolls inside the screen so the footer stays put */}
          <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
            <div key={pathname} className="animate-enter w-full px-3 py-3">
              <Outlet />
            </div>
          </main>

          {/* Slot for a page's footer bar (e.g. the standings legend), pinned
              just above the FastText footer — outside the scroll area. */}
          <div id="tt-legend-slot" />

          {/* FastText */}
          <nav className="tt-fast">
            {FASTTEXT.map((f) => (
              <Link key={f.no} to={f.to} className={f.cls}>
                {f.no} {f.label[lang]}
              </Link>
            ))}
          </nav>
          <nav className="tt-fast tt-fast--pair">
            {FOOTER_MORE.map((f) => (
              <Link key={f.no} to={f.to} className={f.cls}>
                {f.no} {f.label[lang]}
              </Link>
            ))}
          </nav>
          <div className="tt-kbd">
            <span className="k">###</span> = {t.kbd.goToPage} · <span className="k">↑</span>{" "}
            <span className="k">↓</span> <span className="k">←</span> <span className="k">→</span> {t.kbd.navigate}{" "}
            ·{" "}
            {FASTTEXT.map((f, i) => (
              <span key={f.no}>
                {i > 0 ? " " : ""}
                <span className="k">{f.key[lang].toUpperCase()}</span>
              </span>
            ))}{" "}
            = {t.kbd.sections} · <span className="k">⌫</span> {t.kbd.back}
          </div>
        </div>
      </div>
    </div>
  );
}
