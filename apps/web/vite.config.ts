import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
import path from "node:path";

// App version (semver), injected at build time so the About dialog can show it.
// package.json is the single source of truth — bump it to cut a release.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

export default defineConfig(() => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt": a new deploy's SW waits and the app shows an "update available"
      // banner (UpdatePrompt) instead of silently reloading — the user taps to
      // reload. Fixes an installed PWA getting stuck on a stale build.
      registerType: "prompt",
      includeAssets: ["icon.svg", "favicon-32.png", "apple-touch-icon.png"],
      manifest: {
        name: "Lucarne",
        short_name: "Lucarne",
        description: "Football fixtures & the French broadcaster for every match.",
        lang: "fr",
        theme_color: "#05080f",
        background_color: "#05080f",
        display: "standalone",
        start_url: "/",
        categories: ["sports"],
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        importScripts: ["push-sw.js"], // push + notificationclick handlers
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,ico}"],
        // Keep the precache to the app shell: skip the unused crest/logo assets
        // (~9.5 MB) and the iOS launch images (~335 KB, fetched on demand by iOS).
        globIgnores: ["**/logos/**", "**/splash/**"],
        // The SW precaches ONLY the app shell — it never caches /api. Every data
        // request goes straight to the network, so it's always fresh (a stale SW
        // can't serve stale scores/lineups), in dev and prod alike. React Query
        // holds the in-session cache for instant navigation; a cold relaunch loads
        // the shell from precache and fetches fresh data (brief skeleton, no stale).
      },
      // Run the service worker on the dev server too, so the PWA is testable with
      // hot reload. `type: "module"` is required for the dev SW.
      devOptions: { enabled: true, type: "module", suppressWarnings: true },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    // Listen on the LAN too (0.0.0.0), so a phone on the same Wi-Fi can open the
    // dev app at http://<mac-ip>:5173. Vite still proxies /api to the local Hono
    // server, so the API works from the phone with no extra config.
    host: true,
    // Allow the temporary Cloudflare quick-tunnel host (trycloudflare.com) so the
    // app can be opened over https on a phone to test the installable PWA.
    allowedHosts: [".trycloudflare.com"],
    // Local dev: proxy API calls to the Hono server (`bun run dev` in the root).
    proxy: { "/api": "http://localhost:3000" },
  },
  build: { outDir: "dist" },
}));
