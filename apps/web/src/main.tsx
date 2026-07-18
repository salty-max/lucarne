import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { router } from "./router";
import "./index.css";

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
