import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    // Listen on the LAN too (0.0.0.0), so a phone on the same Wi-Fi can open the
    // dev app at http://<mac-ip>:5173. Vite still proxies /api to the local Hono
    // server, so the API works from the phone with no extra config.
    host: true,
    // Local dev: proxy API calls to the Hono server (`bun run dev` in the root).
    proxy: { "/api": "http://localhost:3000" },
  },
  build: { outDir: "dist" },
});
