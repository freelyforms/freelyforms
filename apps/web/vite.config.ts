import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served by the API Worker under /app/ (same origin as the API, see apps/api/src/app.ts).
export default defineConfig({
  base: "/app/",
  plugins: [react()],
  build: {
    outDir: "dist/app",
    emptyOutDir: true,
    // No inline scripts or styles: the app's CSP allows only same-origin files.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
});
