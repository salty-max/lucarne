import { useRegisterSW } from "virtual:pwa-register/react";
import { useT } from "@/lib/i18n";

// How often to ask the browser to re-check for a newer service worker while the
// app stays open. Without this, vite-plugin-pwa only checks at cold start — so an
// installed PWA that's never fully closed would never surface the update banner.
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000; // 30 min

/**
 * "New version available" banner. With registerType "prompt", a fresh deploy's
 * service worker installs and waits; this surfaces it so the user can reload into
 * the new build with a tap — the reliable way to update an installed PWA, which
 * can't be hard-refreshed. Mounted only in production (see Layout).
 *
 * It also drives the update check itself: a periodic poll plus a re-check every
 * time the app regains focus or comes back online, so the banner appears within
 * moments of a deploy instead of only after a full cold start.
 */
export function UpdatePrompt() {
  const t = useT();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const recheck = () => {
        // Offline / transient failures are fine — the next tick retries.
        void registration.update().catch(() => {});
      };
      setInterval(recheck, UPDATE_CHECK_INTERVAL);
      const onForeground = () => {
        if (document.visibilityState === "visible") recheck();
      };
      document.addEventListener("visibilitychange", onForeground);
      window.addEventListener("online", onForeground);
    },
  });

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
