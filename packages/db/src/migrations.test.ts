import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { DELIVERY_STATES, DESTINATION_STATES, PAYLOAD_RETENTION_MS } from "./index.js";

const dir = new URL("../migrations/", import.meta.url);
const migrations = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let db: DatabaseSync;
const now = Date.UTC(2026, 9, 16);
const envelope = JSON.stringify({ v: 1, kid: "k1", dk: "x", ct: "y" });

function seed(): void {
  db.prepare("INSERT INTO users (id, google_sub, email, created_at) VALUES (?, ?, ?, ?)").run(
    "usr_1",
    "sub-1",
    "owner@example.com",
    now,
  );
  db.prepare(
    `INSERT INTO forms (id, owner_id, title, status, draft_json, created_at, updated_at)
     VALUES ('frm_abc123', 'usr_1', 'Contact', 'draft', '{}', ?, ?)`,
  ).run(now, now);
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  for (const file of migrations) db.exec(readFileSync(new URL(file, dir), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
});

describe("migrations", () => {
  it("are numbered consecutively", () => {
    expect(migrations.map((f) => f.slice(0, 4))).toEqual(
      migrations.map((_, i) => String(i + 1).padStart(4, "0")),
    );
  });

  it("never add columns that could hold answers or file contents", () => {
    const forbidden = /answer|response|payload|value|content|file|upload|body/i;
    const tables = db
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const columns = tables.flatMap(({ name }) =>
      (db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).map(
        (c) => `${name}.${c.name}`,
      ),
    );
    expect(columns.filter((c) => forbidden.test(c))).toEqual([]);
  });

  it("keeps state lists in sync with TypeScript", () => {
    const sql = migrations.map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
    for (const s of [...DELIVERY_STATES, ...DESTINATION_STATES]) expect(sql).toContain(`'${s}'`);
  });
});

describe("constraints", () => {
  beforeEach(seed);

  it("stores refresh tokens only as encrypted envelopes", () => {
    const insert = db.prepare(
      `INSERT INTO google_connections (id, user_id, scopes, refresh_token, status, created_at, updated_at)
       VALUES ('gc_1', 'usr_1', 'openid', ?, 'active', ?, ?)`,
    );
    expect(() => insert.run("1//plaintext-token", now, now)).toThrow();
    expect(() => insert.run(envelope, now, now)).not.toThrow();
  });

  it("keeps form slugs lowercase, hyphenated and unique per owner (ADR 0025)", () => {
    const set = db.prepare("UPDATE forms SET slug = ? WHERE id = 'frm_abc123'");
    for (const bad of ["Upper", "-lead", "trail-", "under_score", "", "a".repeat(65)]) {
      expect(() => set.run(bad)).toThrow();
    }
    expect(() => set.run("contact-us")).not.toThrow();
    db.prepare(
      `INSERT INTO forms (id, owner_id, title, status, draft_json, created_at, updated_at)
       VALUES ('frm_def456', 'usr_1', 'Other', 'draft', '{}', ?, ?)`,
    ).run(now, now);
    expect(() =>
      db.prepare("UPDATE forms SET slug = 'contact-us' WHERE id = 'frm_def456'").run(),
    ).toThrow();
  });

  it("makes published form versions immutable", () => {
    db.prepare(
      "INSERT INTO form_versions (form_id, version, schema_json, published_at) VALUES ('frm_abc123', 1, '{}', ?)",
    ).run(now);
    expect(() => {
      db.exec("UPDATE form_versions SET schema_json = '[]'");
    }).toThrow(/immutable/);
  });

  it("requires published forms to point at a version", () => {
    expect(() => {
      db.exec("UPDATE forms SET status = 'published'");
    }).toThrow();
    expect(() => {
      db.exec("UPDATE forms SET status = 'published', published_version = 1");
    }).not.toThrow();
  });

  it("rejects unknown delivery and destination states", () => {
    const delivery = db.prepare(
      `INSERT INTO deliveries (submission_id, form_id, form_version, state, accepted_at, expires_at)
       VALUES (?, 'frm_abc123', 1, ?, ?, ?)`,
    );
    expect(() => delivery.run("01A", "lost", now, now + PAYLOAD_RETENTION_MS)).toThrow();
    expect(() => delivery.run("01B", "queued", now, now + PAYLOAD_RETENTION_MS)).not.toThrow();
    expect(() => delivery.run("01C", "delivered", now, now + PAYLOAD_RETENTION_MS)).toThrow();
    expect(() =>
      db
        .prepare(
          `INSERT INTO destinations (id, form_id, type, spreadsheet_id, sheet_id, state, created_at, updated_at)
           VALUES ('dst_1', 'frm_abc123', 'google_sheet', 's', 0, 'BROKEN', ?, ?)`,
        )
        .run(now, now),
    ).toThrow();
  });

  it("deletes everything owned by a user when the user is deleted", () => {
    db.prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES ('h', 'usr_1', ?, ?, ?)",
    ).run(now, now + 1, now);
    db.exec("DELETE FROM users WHERE id = 'usr_1'");
    for (const table of ["sessions", "forms", "google_connections"]) {
      expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
  });
});
