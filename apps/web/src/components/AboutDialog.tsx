import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { ABOUT_EVENT, KOFI_URL } from "@/lib/about";
import { Rainbow } from "@/components/common";

/**
 * About / support dialog. Opened from Settings (ABOUT_EVENT). A passion-project
 * note plus a no-pressure Ko-fi link — the app is free either way, so the
 * backdrop just closes it and there is nothing to dismiss "for good".
 */
export function AboutDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(ABOUT_EVENT, show);
    return () => window.removeEventListener(ABOUT_EVENT, show);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t.about.title}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-sm border-t-2 border-[hsl(var(--tt-cyan))] bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tt-bar">
          <span>{t.about.title}</span>
        </div>

        <div className="px-3 py-3">
          <p className="mb-1 font-bold uppercase tracking-wide text-[hsl(var(--tt-cyan))]">
            {t.about.tagline}
          </p>
          <Rainbow />

          <p className="mt-3 text-muted-foreground">{t.about.body}</p>
          <p className="mt-2 text-muted-foreground">{t.about.donateWhy}</p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              onClick={() => setOpen(false)}
              className="tt-tag bg-muted py-1 text-muted-foreground hover:text-foreground"
            >
              {t.about.close}
            </button>
            <a
              href={KOFI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="tt-tag bg-[hsl(var(--tt-magenta))] py-1 text-[hsl(var(--tt-magenta-on))]"
            >
              ♥ {t.about.donate}
            </a>
          </div>

          <p className="mt-4 text-center text-xs uppercase tracking-widest text-muted-foreground">
            Lucarne v{__APP_VERSION__} · {__BUILD_DATE__}
          </p>
        </div>
      </div>
    </div>
  );
}
