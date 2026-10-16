import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import { app, type Env } from "../src/app.js";

const root = join(import.meta.dirname, "..");
const persist = mkdtempSync(join(tmpdir(), "freelyforms-d1-"));
let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;

beforeAll(async () => {
  // Apply the real migrations to a local D1 database (workerd), exactly as `wrangler` will in production.
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", persist],
    { cwd: root, stdio: "pipe", env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } },
  );
  proxy = await getPlatformProxy<Env>({
    configPath: join(root, "wrangler.jsonc"),
    // `wrangler --persist-to X` stores state under X/v3.
    persist: { path: join(persist, "v3") },
  });
}, 60_000);

afterAll(async () => {
  await proxy.dispose();
  rmSync(persist, { recursive: true, force: true });
});

const request = (path: string, init?: RequestInit) => app.request(path, init, proxy.env);

describe("api", () => {
  it("reports health with a working database", async () => {
    const res = await request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, schemaVersion: 1, db: "ok" });
  });

  it("sends security headers", async () => {
    const res = await request("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("strict-transport-security")).toMatch(/max-age=/);
  });

  it("returns JSON 404s", async () => {
    const res = await request("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("migrations on D1", () => {
  const now = Date.UTC(2026, 9, 16);

  it("create every table", async () => {
    const { results } = await proxy.env.DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual([
      "column_map_cache",
      "deliveries",
      "destinations",
      "form_daily_stats",
      "form_versions",
      "forms",
      "google_connections",
      "sessions",
      "users",
    ]);
  });

  it("enforce envelopes, immutability and cascades", async () => {
    const db = proxy.env.DB;
    await db.batch([
      db
        .prepare(
          "INSERT INTO users (id, google_sub, email, created_at) VALUES ('usr_1', 's', 'a@b.co', ?)",
        )
        .bind(now),
      db
        .prepare(
          "INSERT INTO forms (id, owner_id, title, status, draft_json, created_at, updated_at) VALUES ('frm_abc123', 'usr_1', 'T', 'draft', '{}', ?, ?)",
        )
        .bind(now, now),
      db
        .prepare(
          "INSERT INTO form_versions (form_id, version, schema_json, published_at) VALUES ('frm_abc123', 1, '{}', ?)",
        )
        .bind(now),
    ]);
    const connection = db.prepare(
      "INSERT INTO google_connections (id, user_id, scopes, refresh_token, status, created_at, updated_at) VALUES ('gc_1', 'usr_1', 'openid', ?, 'active', ?, ?)",
    );
    await expect(connection.bind("1//plaintext", now, now).run()).rejects.toThrow();
    await expect(db.prepare("UPDATE form_versions SET schema_json = '[]'").run()).rejects.toThrow(
      /immutable/,
    );
    await db.prepare("DELETE FROM users WHERE id = 'usr_1'").run();
    expect(await db.prepare("SELECT count(*) AS n FROM form_versions").first("n")).toBe(0);
  });
});
