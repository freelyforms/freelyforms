import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import type { Env } from "../src/app.js";

const root = join(import.meta.dirname, "..");

/** A fresh local D1 database (workerd) with the real migrations applied. */
export async function localD1(): Promise<{ db: D1Database; dispose: () => Promise<void> }> {
  const persist = mkdtempSync(join(tmpdir(), "freelyforms-d1-"));
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", persist],
    { cwd: root, stdio: "pipe", env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } },
  );
  const proxy = await getPlatformProxy<Pick<Env, "DB">>({
    configPath: join(root, "wrangler.jsonc"),
    // `wrangler --persist-to X` stores state under X/v3.
    persist: { path: join(persist, "v3") },
  });
  return {
    db: proxy.env.DB,
    dispose: async () => {
      await proxy.dispose();
      rmSync(persist, { recursive: true, force: true });
    },
  };
}
