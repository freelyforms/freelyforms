/**
 * Starts the e2e Worker on a fresh local database: wipes the previous state, applies the
 * migrations and runs `wrangler dev` with a master key generated for this run.
 * Playwright starts it (playwright.config.ts → webServer); the builder must be built first.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";

/** Must match playwright.config.ts. */
const E2E_PORT = Number(process.env.E2E_PORT ?? 8790);

const config = join(import.meta.dirname, "wrangler.jsonc");
const state = join(import.meta.dirname, ".state");
rmSync(state, { recursive: true, force: true });

const wrangler = (args: string[]) => ["exec", "wrangler", ...args, "--config", config];
const migrate = spawnSync(
  "pnpm",
  wrangler(["d1", "migrations", "apply", "DB", "--local", "--persist-to", state]),
  { stdio: "inherit", env: { ...process.env, CI: "1" } },
);
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const masterKey = randomBytes(32).toString("base64url");
const dev = spawn(
  "pnpm",
  wrangler([
    "dev",
    "--port",
    String(E2E_PORT),
    "--persist-to",
    state,
    "--var",
    `MASTER_KEY_K1:${masterKey}`,
    "--show-interactive-dev-session=false",
  ]),
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => dev.kill(signal));
dev.on("exit", (code) => process.exit(code ?? 0));
