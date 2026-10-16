import {
  createKeyring,
  encrypt,
  generateMasterKeySecret,
  importMasterKey,
} from "@freelyforms/crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, type Env } from "../src/app.js";
import { maintenance, processBatch, TRANSIENT_RETRY_WINDOW_MS } from "../src/delivery/consumer.js";
import type { DeliveryMessage, Deps } from "../src/env.js";
import { randomToken, sha256Base64Url } from "../src/util.js";
import { localD1 } from "./d1.js";
import { fakeGoogle } from "./fake-google.js";
import { fakeKv, fakeQueue, message } from "./fakes.js";

const ORIGIN = "http://localhost";
let clock = Date.UTC(2026, 9, 16, 12);
let d1: Awaited<ReturnType<typeof localD1>>;
let masterKey: string;

beforeAll(async () => {
  d1 = await localD1();
  masterKey = generateMasterKeySecret();
}, 60_000);

afterAll(async () => {
  await d1.dispose();
});

let google: ReturnType<typeof fakeGoogle>;
let queue: ReturnType<typeof fakeQueue>;
let kv: ReturnType<typeof fakeKv>;
let env: Env;
let deps: Deps;
let cookie: string;

beforeEach(async () => {
  clock = Date.UTC(2026, 9, 16, 12);
  google = fakeGoogle();
  queue = fakeQueue();
  kv = fakeKv(() => clock);
  deps = { fetch: google.fetchFn, now: () => clock };
  env = {
    DB: d1.db,
    DELIVERY_QUEUE: queue.queue,
    HOLD: kv.kv,
    GOOGLE_CLIENT_ID: "client",
    GOOGLE_CLIENT_SECRET: "secret",
    MASTER_KEY_K1: masterKey,
  };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM deliveries"),
    env.DB.prepare("DELETE FROM users"),
  ]);

  // A signed-in owner with an active Google connection.
  const keyring = createKeyring(await importMasterKey("k1", masterKey));
  const token = randomToken();
  cookie = `__Host-ff_session=${token}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, google_sub, email, created_at) VALUES ('usr_owner', 'sub', 'owner@example.com', ?)",
    ).bind(clock),
    env.DB.prepare(
      "INSERT INTO google_connections (id, user_id, scopes, refresh_token, status, created_at, updated_at) VALUES ('gc_1', 'usr_owner', 'openid', ?, 'active', ?, ?)",
    ).bind(
      JSON.stringify(await encrypt(keyring, "1//refresh", "google-refresh:usr_owner")),
      clock,
      clock,
    ),
    env.DB.prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, 'usr_owner', ?, ?, ?)",
    ).bind(await sha256Base64Url(token), clock, clock + 86_400_000, clock),
  ]);
});

const app = () => createApp(deps);

function owner(path: string, init: { method?: string; body?: unknown } = {}) {
  return app().request(
    path,
    {
      method: init.method ?? "GET",
      headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    },
    env,
  );
}

const fields = [
  { id: "fld_name", type: "text", label: "Name", required: true },
  { id: "fld_email", type: "email", label: "Email", required: true },
  {
    id: "fld_topic",
    type: "radio",
    label: "Topic",
    options: [
      { id: "opt_sales", label: "Sales" },
      { id: "opt_support", label: "Support" },
    ],
  },
];

/** Creates and publishes a form; returns its ID. */
async function publishedForm(extraFields: unknown[] = []): Promise<string> {
  const created = await owner("/forms", { method: "POST", body: { title: "Contact" } });
  expect(created.status).toBe(201);
  const { id } = await created.json<{ id: string }>();
  const draft = await owner(`/forms/${id}/draft`, {
    method: "PUT",
    body: { schemaVersion: 1, id, title: "Contact", fields: [...fields, ...extraFields] },
  });
  expect(draft.status).toBe(200);
  const published = await owner(`/forms/${id}/publish`, { method: "POST" });
  expect(published.status).toBe(200);
  return id;
}

function submit(
  formId: string,
  body: Record<string, string | string[]>,
  headers: Record<string, string> = {},
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) for (const x of [v].flat()) params.append(k, x);
  return app().request(
    `/f/${formId}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://someone-elses-site.example",
        ...headers,
      },
      body: params.toString(),
    },
    env,
  );
}

async function deliver(messages = queue.sent.splice(0), attempts = 1) {
  const wrapped = messages.map((b) => message(b, attempts));
  await processBatch(
    {
      messages: wrapped.map((w) => w.m),
      queue: "q",
      metadata: {},
    } as unknown as MessageBatch<DeliveryMessage>,
    env,
    deps,
  );
  return wrapped.map((w) => w.outcome);
}

const deliveryStates = async () =>
  (
    await env.DB.prepare("SELECT state FROM deliveries ORDER BY submission_id").all<{
      state: string;
    }>()
  ).results.map((r) => r.state);

const onlySheet = () => {
  const [sheet] = [...google.sheets.values()];
  if (!sheet) throw new Error("no spreadsheet");
  return sheet;
};

describe("owner forms API", () => {
  it("requires a session", async () => {
    const res = await app().request("/forms", {}, env);
    expect(res.status).toBe(401);
  });

  it("rejects invalid drafts with path-tagged issues", async () => {
    const { id } = await (
      await owner("/forms", { method: "POST", body: {} })
    ).json<{ id: string }>();
    const res = await owner(`/forms/${id}/draft`, {
      method: "PUT",
      body: { schemaVersion: 1, id, title: "", fields: [] },
    });
    expect(res.status).toBe(422);
    const body = await res.json<{ error: string; issues: { path: string }[] }>();
    expect(body.error).toBe("invalid_form");
    expect(body.issues.map((i) => i.path)).toContain("title");
  });

  it("refuses to publish a form without fields", async () => {
    const { id } = await (
      await owner("/forms", { method: "POST", body: {} })
    ).json<{ id: string }>();
    expect((await owner(`/forms/${id}/publish`, { method: "POST" })).status).toBe(422);
  });

  it("publishes an immutable version and creates the response spreadsheet once", async () => {
    const id = await publishedForm();
    const sheet = onlySheet();
    expect(sheet.rows[0]).toEqual([
      "_submission_id",
      "_submitted_at",
      "_form_version",
      "Name",
      "Email",
      "Topic",
    ]);
    const form = await (
      await owner(`/forms/${id}`)
    ).json<{ publishedVersion: number; destination: { url: string } }>();
    expect(form.publishedVersion).toBe(1);
    expect(form.destination.url).toMatch(/docs\.google\.com\/spreadsheets\/d\/sheet1/);

    // Version 2 adds a field: same spreadsheet, one new column at the end.
    await owner(`/forms/${id}/draft`, {
      method: "PUT",
      body: {
        schemaVersion: 1,
        id,
        title: "Contact",
        fields: [...fields, { id: "fld_phone", type: "phone", label: "Phone" }],
      },
    });
    const v2 = await (
      await owner(`/forms/${id}/publish`, { method: "POST" })
    ).json<{ publishedVersion: number }>();
    expect(v2.publishedVersion).toBe(2);
    expect(google.sheets.size).toBe(1);
    expect(sheet.rows[0]?.[6]).toBe("Phone");
  });

  it("asks the owner to reconnect when Google access was revoked", async () => {
    google.state.revoked = true;
    const { id } = await (
      await owner("/forms", { method: "POST", body: {} })
    ).json<{ id: string }>();
    await owner(`/forms/${id}/draft`, {
      method: "PUT",
      body: { schemaVersion: 1, id, title: "T", fields },
    });
    const res = await owner(`/forms/${id}/publish`, { method: "POST" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "google_access_required" });
    expect(await env.DB.prepare("SELECT status FROM google_connections").first("status")).toBe(
      "revoked",
    );
  });
});

describe("public form", () => {
  it("renders an accessible, noindex form", async () => {
    const id = await publishedForm();
    const res = await app().request(`/f/${id}`, {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    const page = await res.text();
    expect(page).toContain('<label for="fld_name">Name');
    expect(page).toContain("<legend>Topic");
    expect(page).not.toContain("<script");
  });

  it("returns 404 for unknown or unpublished forms", async () => {
    expect((await app().request("/f/frm_doesnotexist", {}, env)).status).toBe(404);
  });

  it("accepts a cross-origin submission and queues only encrypted answers", async () => {
    const id = await publishedForm();
    const res = await submit(id, {
      fld_name: "Ada Lovelace",
      fld_email: "ada@example.com",
      fld_topic: "opt_support",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("your response was received");
    expect(queue.sent).toHaveLength(1);
    expect(JSON.stringify(queue.sent[0])).not.toContain("Ada");
    expect(await deliveryStates()).toEqual(["queued"]);
  });

  it("re-renders with accessible errors and keeps the input", async () => {
    const id = await publishedForm();
    const res = await submit(id, { fld_name: "Ada", fld_email: "not-an-email" });
    expect(res.status).toBe(422);
    const page = await res.text();
    expect(page).toContain("Enter a valid email address.");
    expect(page).toContain('aria-invalid="true"');
    expect(page).toContain('value="Ada"');
    expect(queue.sent).toHaveLength(0);
  });

  it("supports JSON clients", async () => {
    const id = await publishedForm();
    const ok = await app().request(
      `/f/${id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ fld_name: "A", fld_email: "a@b.co" }),
      },
      env,
    );
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ ok: true, submissionId: expect.any(String) as string });
    const bad = await app().request(
      `/f/${id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: "{}",
      },
      env,
    );
    expect(bad.status).toBe(422);
  });

  it("silently drops honeypot submissions", async () => {
    const id = await publishedForm();
    const res = await submit(id, {
      fld_name: "Bot",
      fld_email: "bot@example.com",
      _hp: "http://spam.example",
    });
    expect(res.status).toBe(200);
    expect(queue.sent).toHaveLength(0);
  });

  it("serves forms at the root of the forms domain and nothing else there", async () => {
    const id = await publishedForm();
    const formsEnv = { ...env, FORMS_HOST: "forms.test" };
    expect((await app().request(`http://forms.test/${id}`, {}, formsEnv)).status).toBe(200);
    expect((await app().request("http://forms.test/auth/me", {}, formsEnv)).status).toBe(404);
  });
});

describe("delivery", () => {
  it("writes a batch in one append with answers in the right columns", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com", fld_topic: "opt_sales" });
    await submit(id, { fld_name: '=HYPERLINK("x")', fld_email: "b@example.com" });
    const outcomes = await deliver();
    expect(outcomes.every((o) => o.acked)).toBe(true);
    const sheet = onlySheet();
    expect(sheet.rows.slice(1).map((r) => r.slice(3))).toEqual([
      ["Ada", "ada@example.com", "Sales"],
      ['=HYPERLINK("x")', "b@example.com", ""], // unanswered topic: empty cell
    ]);
    expect(google.state.calls.filter((c) => c.endsWith(":batchUpdate")).length).toBe(2); // metadata at publish + one append
    expect(await deliveryStates()).toEqual(["delivered", "delivered"]);
  });

  it("does not deliver a message twice", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    const [msg] = queue.sent.splice(0);
    if (!msg) throw new Error("no message");
    await deliver([msg]);
    await deliver([msg]);
    expect(onlySheet().rows).toHaveLength(2);
  });

  it("reconciles an ambiguous write instead of duplicating the row (ADR 0003)", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    const [msg] = queue.sent.splice(0);
    if (!msg) throw new Error("no message");
    google.state.failNextAppend = { status: "network", when: "after" };
    const [first] = await deliver([msg]);
    expect(first?.retryDelay).toBeGreaterThan(0);
    expect(await deliveryStates()).toEqual(["unknown"]);

    const [second] = await deliver([msg], 2);
    expect(second?.acked).toBe(true);
    expect(onlySheet().rows).toHaveLength(2);
    expect(await deliveryStates()).toEqual(["delivered"]);
  });

  it("retries transient errors with backoff and gives up after 72 hours", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    const [msg] = queue.sent.splice(0);
    if (!msg) throw new Error("no message");
    google.state.failNextAppend = { status: 503, when: "before" };
    const [first] = await deliver([msg]);
    expect(first?.retryDelay).toBeGreaterThanOrEqual(24);
    expect(await deliveryStates()).toEqual(["unknown"]);

    clock += TRANSIENT_RETRY_WINDOW_MS + 1;
    google.state.failNextAppend = { status: 503, when: "before" };
    const [late] = await deliver([msg], 30);
    expect(late?.acked).toBe(true);
    expect(await deliveryStates()).toEqual(["permanently_failed"]);
  });

  it("holds deliveries when the sheet is deleted and resumes after the owner fixes it (ADR 0011)", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    const sheet = onlySheet();
    google.sheets.delete("sheet1");
    const [outcome] = await deliver();
    expect(outcome?.acked).toBe(true);
    expect(await deliveryStates()).toEqual(["blocked"]);
    expect([...kv.store.keys()]).toHaveLength(1);
    const [held] = [...kv.store.values()];
    expect(held?.expiration).toBe(Math.floor((clock + 7 * 86_400_000) / 1000));
    expect(held?.value).not.toContain("Ada");
    const status = await (
      await owner(`/forms/${id}/deliveries`)
    ).json<{ destination: { state: string } }>();
    expect(status).toEqual({ destination: { state: "SHEET_DELETED" }, counts: { blocked: 1 } });

    google.sheets.set("sheet1", sheet); // the owner restores it from the bin
    const resumed = await (
      await owner(`/forms/${id}/deliveries/resume`, { method: "POST" })
    ).json<{ resumed: number }>();
    expect(resumed).toEqual({ resumed: 1 });
    expect(kv.store.size).toBe(0);
    await deliver();
    expect(await deliveryStates()).toEqual(["delivered"]);
    expect(sheet.rows).toHaveLength(2);
  });

  it("blocks with ACCESS_REVOKED when the owner revokes Google access", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    google.state.revoked = true;
    await deliver();
    expect(await deliveryStates()).toEqual(["blocked"]);
    expect(await env.DB.prepare("SELECT state FROM destinations").first("state")).toBe(
      "ACCESS_REVOKED",
    );
  });

  it("blocks with COLUMN_MISSING when the owner deletes a system column", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    const sheet = onlySheet();
    sheet.meta = sheet.meta.filter((m) => m.metadataValue !== "_submission_id");
    await deliver();
    expect(await env.DB.prepare("SELECT state FROM destinations").first("state")).toBe(
      "COLUMN_MISSING",
    );
  });
});

describe("maintenance", () => {
  it("fails deliveries past the 7-day deadline and removes expired sessions", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    clock += 8 * 86_400_000;
    await maintenance(env, clock);
    expect(await deliveryStates()).toEqual(["permanently_failed"]);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM sessions").first("n")).toBe(0);
  });
});
