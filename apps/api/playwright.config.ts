import { defineConfig, devices } from "@playwright/test";

/** The port e2e/serve.ts starts the Worker on. */
const E2E_PORT = Number(process.env.E2E_PORT ?? 8790);
const baseURL = `http://localhost:${String(E2E_PORT)}`;

/**
 * End-to-end tests against the e2e Worker (e2e/worker.ts) in a real browser. Run with
 * `pnpm e2e` from the repository root, which builds the builder first. E2E_CHANNEL=chrome uses an
 * installed Chrome instead of Playwright's Chromium.
 */
export default defineConfig({
  testDir: "e2e",
  // Tests share one Worker and its fake Google; they create their own forms, so order is free,
  // but one worker keeps the local queue and database simple to reason about.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@phone/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: {
    command: "node e2e/serve.ts",
    url: `${baseURL}/health`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
