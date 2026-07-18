import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate", // new version reloads itself after a deploy
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
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,ico}"],
        // Keep the precache to the app shell: skip the unused crest/logo assets
        // (~9.5 MB) and the iOS launch images (~335 KB, fetched on demand by iOS).
        globIgnores: ["**/logos/**", "**/splash/**"],
        runtimeCaching: [
          {
            // Read data: serve the last-seen copy instantly (so a PWA relaunch has
            // no network wait), then revalidate in the background. React Query does
            // the same on the client — together, loads rarely show a skeleton.
            urlPattern: ({ url }: { url: URL }) =>
              /^\/api\/(schedule|competitions|competition\/|teams|match\/)/.test(url.pathname),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "lucarne-data",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // live scores + logs aren't matched above → always straight to network.
      },
      devOptions: { enabled: true, type: "module" }, // so the SW works over the https tunnel
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
});
