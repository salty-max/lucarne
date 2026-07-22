import { useRegisterSW } from "virtual:pwa-register/react";
import { useT } from "@/lib/i18n";

/**
 * "New version available" banner. With registerType "prompt", a fresh deploy's
 * service worker installs and waits; this surfaces it so the user can reload into
 * the new build with a tap — the reliable way to update an installed PWA, which
 * can't be hard-refreshed. Mounted only in production (see Layout).
 */
export function UpdatePrompt() {
  const t = useT();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-2 border-t-2 border-[hsl(var(--tt-green))] bg-background px-3 py-2">
      <span className="flex-1 uppercase tracking-wide text-[hsl(var(--tt-green))]">
        {t.update.available}
      </span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="tt-tag bg-[hsl(var(--tt-green))] py-1 text-[hsl(var(--tt-green-on))]"
      >
        {t.update.reload}
      </button>
      <button onClick={() => setNeedRefresh(false)} aria-label={t.about.close} className="tt-navbtn">
        ✕
      </button>
    </div>
  );
}
