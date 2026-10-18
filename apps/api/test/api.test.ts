import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app, type Env } from "../src/app.js";
import { localD1 } from "./d1.js";
import { fakeKv, fakeQueue } from "./fakes.js";

let d1: Awaited<ReturnType<typeof localD1>>;
let env: Env;

beforeAll(async () => {
  d1 = await localD1();
  env = {
    DB: d1.db,
    DELIVERY_QUEUE: fakeQueue().queue,
    HOLD: fakeKv(() => 0).kv,
    GOOGLE_CLIENT_ID: "x",
    GOOGLE_CLIENT_SECRET: "x",
    MASTER_KEY_K1: "x",
  };
}, 60_000);

afterAll(async () => {
  await d1.dispose();
});

const request = (path: string, init?: RequestInit) => app.request(path, init, env);

describe("api", () => {
  it("reports health with a working database", async () => {
    const res = await request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, schemaVersion: 1, db: "ok" });
  });

  it("sends security headers", async () => {
    const res = await request("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // Framing is controlled by CSP: app pages forbid it, public forms allow it for embeds.
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("strict-transport-security")).toMatch(/max-age=/);
    // `no-referrer` would make browsers send `Origin: null` on form posts and break the CSRF check.
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
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
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual([
      "column_map_cache",
      "custom_domains",
      "deliveries",
      "destinations",
      "drive_folders",
      "form_daily_stats",
      "form_members",
      "form_versions",
      "forms",
      "google_connections",
      "sessions",
      "users",
      "webhooks",
    ]);
  });

  it("enforce envelopes, immutability and cascades", async () => {
    const db = env.DB;
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
