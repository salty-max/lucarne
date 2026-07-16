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
    // Local dev: proxy API calls to the Hono server (`pnpm dev` in the root).
    proxy: { "/api": "http://localhost:3000" },
  },
  build: { outDir: "dist" },
});
