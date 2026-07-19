import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { router } from "./router";
import "./index.css";

// In dev, evict a stale PRODUCTION service worker (`sw.js`) if one is left over
// from a build/tunnel test: its precache points at built asset hashes that don't
// exist on the dev server, which 404-loops the page. The dev SW (`dev-sw.js`,
// enabled via vite-plugin-pwa devOptions) re-registers cleanly and keeps HMR.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) {
      const url = r.active?.scriptURL ?? r.waiting?.scriptURL ?? r.installing?.scriptURL ?? "";
      if (url.endsWith("/sw.js")) {
        r.unregister();
        if (typeof caches !== "undefined") caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
      }
    }
  });
}

const rootEl = document.getElementById("root")!;

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

// Fade out the boot splash the moment the app shell paints into #root, so it
// hands straight over to the CRT screen (skeleton and all) with no white gap.
(() => {
  const splash = document.getElementById("splash");
  if (!splash) return;
  const remove = () => {
    splash.classList.add("splash-hide");
    splash.addEventListener("transitionend", () => splash.remove(), { once: true });
  };
  if (rootEl.childElementCount > 0) return remove();
  const obs = new MutationObserver(() => {
    if (rootEl.childElementCount > 0) {
      obs.disconnect();
      remove();
    }
  });
  obs.observe(rootEl, { childList: true });
})();
