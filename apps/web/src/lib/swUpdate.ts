/**
 * Apply a waiting service worker and reload into it — robustly.
 *
 * vite-plugin-pwa's `updateServiceWorker(true)` only reloads on a
 * `controlling` event flagged `isUpdate`, which workbox-window sets once, at
 * registration, from "was a SW already controlling this page?". On the first
 * session after installing the PWA nothing controls the page, so the new SW
 * activates and the page never reloads: the "Reload" button looks dead (and on
 * iOS that first session can last days). So we reload on whichever comes first:
 * the controller change, the waiting worker reaching "activated", or a timeout.
 */
type Deps = {
  reload: () => void;
  timeoutMs?: number;
  /** Only the controllerchange listener is used (injectable for tests). */
  serviceWorker?: {
    addEventListener(type: "controllerchange", listener: () => void, options?: AddEventListenerOptions): void;
  };
};

export function applyUpdate(registration: ServiceWorkerRegistration | null | undefined, deps: Deps): void {
  const { reload, timeoutMs = 4000, serviceWorker = navigator.serviceWorker } = deps;
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    reload();
  };

  const waiting = registration?.waiting;
  if (!waiting) return go(); // nothing to activate (or it already did): just reload

  serviceWorker.addEventListener("controllerchange", go, { once: true });
  waiting.addEventListener("statechange", () => {
    if (waiting.state === "activated" || waiting.state === "redundant") go();
  });
  waiting.postMessage({ type: "SKIP_WAITING" });
  setTimeout(go, timeoutMs); // never leave the button dead
}
