import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { INSTALL_EVENT, canInstall, dismissInstall, installDismissed } from "@/lib/install";

/** Safari's Share glyph (box with an arrow out of the top) — the step people miss. */
function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      aria-hidden
    >
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v8h14v-8" />
    </svg>
  );
}

/** The "Add to Home Screen" row icon (square with a plus). */
function AddIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

const AUTO_DELAY = 15_000; // let people get their answer first (SEO visitors)

/**
 * iOS install guide. Auto-opens once per session on iOS-in-a-tab (unless the user
 * dismissed it for good), and can be re-opened from Settings via INSTALL_EVENT.
 * Never blocks: tapping the backdrop just closes it.
 */
export function InstallPrompt() {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(INSTALL_EVENT, show);
    let id: number | undefined;
    if (canInstall() && !installDismissed()) id = window.setTimeout(show, AUTO_DELAY);
    return () => {
      window.removeEventListener(INSTALL_EVENT, show);
      if (id) window.clearTimeout(id);
    };
  }, []);

  if (!open) return null;

  const steps = [
    { icon: <ShareIcon className="h-4 w-4" />, text: t.install.step1 },
    { icon: <AddIcon className="h-4 w-4" />, text: t.install.step2 },
    { icon: null, text: t.install.step3 },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-label={t.install.title}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-sm border-t-2 border-[hsl(var(--tt-cyan))] bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tt-bar">
          <span>{t.install.title}</span>
        </div>

        <div className="px-3 py-3">
          <p className="mb-3 text-muted-foreground">{t.install.why}</p>

          <ol className="flex flex-col">
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2 border-b border-dotted border-border py-2 last:border-b-0">
                <span className="w-4 shrink-0 font-bold tabular-nums text-[hsl(var(--tt-yellow))]">{i + 1}</span>
                <span className="min-w-0 flex-1">{s.text}</span>
                {s.icon && <span className="shrink-0 text-[hsl(var(--tt-cyan))]">{s.icon}</span>}
              </li>
            ))}
          </ol>

          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => {
                dismissInstall();
                setOpen(false);
              }}
              className="tt-tag bg-muted py-1 text-muted-foreground hover:text-foreground"
            >
              {t.install.later}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="tt-tag bg-[hsl(var(--tt-cyan))] py-1 text-[hsl(var(--tt-cyan-on))]"
            >
              {t.install.gotIt}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
