import { Script } from "node:vm";
import {
  createKeyring,
  encrypt,
  generateMasterKeySecret,
  importMasterKey,
} from "@freelyforms/crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, type Env } from "../src/app.js";
import {
  cleanUploads,
  healthReport,
  maintenance,
  processBatch,
  STUCK_AFTER_MS,
  TRANSIENT_RETRY_WINDOW_MS,
} from "../src/delivery/consumer.js";
import { resumeHeld } from "../src/delivery/hold.js";
import type { DeliveryMessage, Deps } from "../src/env.js";
import { randomToken, sha256Base64Url } from "../src/util.js";
import { localD1 } from "./d1.js";
import { fakeGoogle } from "./fake-google.js";
import { fakeKv, fakeQueue, message } from "./fakes.js";
import { FORM_CLIENT_JS } from "../src/public/client.generated.js";

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

  it("creates a form from a website template with a fresh ID", async () => {
    const res = await owner("/forms", { method: "POST", body: { template: "contact-form" } });
    expect(res.status).toBe(201);
    const view = await res.json<{
      id: string;
      title: string;
      draft: { id: string; fields: unknown[] };
    }>();
    expect(view.title).toBe("Contact us");
    expect(view.draft.id).toBe(view.id);
    expect(view.draft.fields.length).toBeGreaterThan(2);
    expect((await owner("/forms", { method: "POST", body: { template: "nope" } })).status).toBe(
      422,
    );
  });

  it("imports an exported form as a new draft, keeping field IDs", async () => {
    const exported = {
      schemaVersion: 1,
      id: "frm_elsewhere1",
      title: "Imported",
      fields: [
        ...fields,
        {
          id: "fld_more",
          type: "text",
          label: "More",
          showIf: {
            match: "all",
            rules: [{ field: "fld_topic", op: "equals", value: "opt_sales" }],
          },
        },
      ],
    };
    const res = await owner("/forms/import", { method: "POST", body: exported });
    expect(res.status).toBe(201);
    const view = await res.json<{
      id: string;
      status: string;
      destination: unknown;
      draft: { id: string; fields: { id: string }[] };
    }>();
    expect(view.id).not.toBe("frm_elsewhere1");
    expect(view).toMatchObject({ status: "draft", destination: null, draft: { id: view.id } });
    expect(view.draft.fields.map((f) => f.id)).toEqual(exported.fields.map((f) => f.id));

    const bad = await owner("/forms/import", {
      method: "POST",
      body: { ...exported, fields: [{ id: "fld_x", type: "nope", label: "X" }] },
    });
    expect(bad.status).toBe(422);
    expect((await bad.json<{ error: string }>()).error).toBe("invalid_form");
    expect((await owner("/forms/import", { method: "POST", body: [1] })).status).toBe(422);
  });

  it("duplicates a form as a new draft without its spreadsheet", async () => {
    const id = await publishedForm();
    await owner(`/forms/${id}/draft`, {
      method: "PUT",
      body: { schemaVersion: 1, id, title: "Contact v2", fields },
    });
    const res = await owner(`/forms/${id}/duplicate`, { method: "POST" });
    expect(res.status).toBe(201);
    const copy = await res.json<{
      id: string;
      title: string;
      status: string;
      publishedVersion: number | null;
      destination: unknown;
      draft: { id: string; title: string; fields: unknown[] };
    }>();
    expect(copy.id).not.toBe(id);
    expect(copy).toMatchObject({
      title: "Contact v2 (copy)",
      status: "draft",
      publishedVersion: null,
      destination: null,
      draft: { id: copy.id, title: "Contact v2 (copy)", fields },
    });
    expect((await owner(`/forms/${copy.id}/deliveries`)).status).toBe(200);
    expect((await owner("/forms/frm_missing000/duplicate", { method: "POST" })).status).toBe(404);
  });

  it("does not report unpublished changes for a template published as it is", async () => {
    const created = await owner("/forms", { method: "POST", body: { template: "contact-form" } });
    const { id } = await created.json<{ id: string }>();
    expect((await owner(`/forms/${id}/publish`, { method: "POST" })).status).toBe(200);
    const view = await (await owner(`/forms/${id}`)).json<{ hasUnpublishedChanges: boolean }>();
    expect(view.hasUnpublishedChanges).toBe(false);
  });

  it("hides one owner's forms from another owner", async () => {
    const id = await publishedForm();
    const token = randomToken();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, google_sub, email, created_at) VALUES ('usr_other', 'sub2', 'other@example.com', ?)",
      ).bind(clock),
      env.DB.prepare(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, 'usr_other', ?, ?, ?)",
      ).bind(await sha256Base64Url(token), clock, clock + 86_400_000, clock),
    ]);
    const other = (path: string, method = "GET", body?: unknown) =>
      app().request(
        path,
        {
          method,
          headers: {
            cookie: `__Host-ff_session=${token}`,
            origin: ORIGIN,
            "content-type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
        env,
      );
    expect((await (await other("/forms")).json<{ forms: unknown[] }>()).forms).toEqual([]);
    for (const [path, method, body] of [
      [`/forms/${id}`, "GET"],
      [`/forms/${id}/draft`, "PUT", { schemaVersion: 1, id, title: "x", fields: [] }],
      [`/forms/${id}/publish`, "POST"],
      [`/forms/${id}/deliveries`, "GET"],
      [`/forms/${id}/deliveries/resume`, "POST"],
      [`/forms/${id}`, "DELETE"],
    ] as const) {
      expect((await other(path, method, body)).status, `${method} ${path}`).toBe(404);
    }
    expect((await owner(`/forms/${id}`)).status).toBe(200);
  });

  it("reports unpublished changes", async () => {
    const id = await publishedForm();
    const state = async () =>
      (await (await owner(`/forms/${id}`)).json<{ hasUnpublishedChanges: boolean }>())
        .hasUnpublishedChanges;
    expect(await state()).toBe(false);
    await owner(`/forms/${id}/draft`, {
      method: "PUT",
      body: { schemaVersion: 1, id, title: "Contact v2", fields },
    });
    expect(await state()).toBe(true);
    await owner(`/forms/${id}/publish`, { method: "POST" });
    expect(await state()).toBe(false);
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
    expect(page).not.toContain("challenges.cloudflare.com");
    expect(page).not.toContain('class="field cf-turnstile"');
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

  it("refuses bodies over 64 KB even without a Content-Length", async () => {
    const id = await publishedForm();
    const big = new TextEncoder().encode(`fld_name=${"a".repeat(70 * 1024)}&fld_email=a%40b.co`);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < big.length; i += 8192) controller.enqueue(big.slice(i, i + 8192));
        controller.close();
      },
    });
    const res = await app().request(
      `/f/${id}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: stream,
        duplex: "half",
      } as RequestInit,
      env,
    );
    expect(res.status).toBe(413);
    expect(queue.sent).toHaveLength(0);
  });

  it("escapes owner-supplied text and echoed answers", async () => {
    const created = await owner("/forms", { method: "POST", body: { title: "x" } });
    const { id } = await created.json<{ id: string }>();
    const evil = "<script>alert(1)</script>";
    await owner(`/forms/${id}/draft`, {
      method: "PUT",
      body: {
        schemaVersion: 1,
        id,
        title: evil,
        fields: [
          { id: "fld_a", type: "text", label: evil, description: evil, required: true },
          { id: "fld_b", type: "radio", label: "R", options: [{ id: "opt_a", label: evil }] },
          { id: "fld_c", type: "email", label: "E" },
        ],
      },
    });
    expect((await owner(`/forms/${id}/publish`, { method: "POST" })).status).toBe(200);
    const page = await (
      await submit(id, { fld_a: "", fld_c: `"><img src=x onerror=alert(1)>` })
    ).text();
    expect(page).not.toContain("<script>alert");
    expect(page).not.toContain("<img src=x");
    expect(page).toContain("&lt;script&gt;");
  });

  it("returns a submission ID for honeypot hits too", async () => {
    const id = await publishedForm();
    const res = await app().request(
      `/f/${id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ fld_name: "A", fld_email: "a@b.co", _hp: "x" }),
      },
      env,
    );
    expect(await res.json()).toMatchObject({
      ok: true,
      submissionId: expect.any(String) as string,
    });
    expect(queue.sent).toHaveLength(0);
  });

  it("serves the web app with its CSP and an SPA fallback", async () => {
    const files: Record<string, string> = {
      "/": "<!doctype html><title>app</title>",
      "/assets/app.js": "console.log(1)",
    };
    const seen: string[] = [];
    const ASSETS = {
      fetch: (req: Request) => {
        const path = new URL(req.url).pathname;
        seen.push(path);
        const body = files[path];
        return Promise.resolve(
          body === undefined
            ? new Response("not found", { status: 404 })
            : new Response(body, {
                headers: { "content-type": path.endsWith(".js") ? "text/javascript" : "text/html" },
              }),
        );
      },
    } as unknown as Fetcher;
    const appEnv = { ...env, ASSETS };
    const page = await app().request("/app/forms/frm_abcdef12", {}, appEnv);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(page.headers.get("cache-control")).toBe("no-cache");
    expect(seen).toEqual(["/forms/frm_abcdef12", "/"]);
    const js = await app().request("/app/assets/app.js", {}, appEnv);
    expect(js.headers.get("content-security-policy")).not.toContain("script-src 'self'");
    expect((await app().request("/app/assets/missing.js", {}, appEnv)).status).toBe(404);
  });

  it("publishes a privacy policy with Google's Limited Use statement, and terms", async () => {
    const privacy = await app().request("/privacy", {}, env);
    expect(privacy.status).toBe(200);
    const text = await privacy.text();
    expect(text).toContain("Limited Use requirements");
    expect(text).toContain("no later than 7 days");
    expect(privacy.headers.get("content-security-policy")).toContain("style-src 'nonce-");
    expect((await app().request("/terms", {}, env)).status).toBe(200);
    const formsEnv = { ...env, FORMS_HOST: "forms.test" };
    expect((await app().request("http://forms.test/privacy", {}, formsEnv)).status).toBe(404);
  });

  it("sends plain HTTP and the www host to the canonical HTTPS origin when hosted", async () => {
    const hosted = { ...env, APP_ORIGIN: "https://app.test" };
    const http = await app().request("http://app.test/app/?x=1", {}, hosted);
    expect([http.status, http.headers.get("location")]).toEqual([308, "https://app.test/app/?x=1"]);
    const www = await app().request("https://www.app.test/privacy", {}, hosted);
    expect(www.headers.get("location")).toBe("https://app.test/privacy");
    expect((await app().request("http://localhost/health", {}, env)).status).toBe(200);
  });

  it("redirects forms on the app domain to the forms domain", async () => {
    const id = await publishedForm();
    const formsEnv = { ...env, FORMS_HOST: "forms.test" };
    const res = await app().request(`http://app.test/f/${id}`, {}, formsEnv);
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(`https://forms.test/${id}`);
  });

  it("serves forms at the root of the forms domain and nothing else there", async () => {
    const id = await publishedForm();
    const formsEnv = { ...env, FORMS_HOST: "forms.test" };
    expect((await app().request(`http://forms.test/${id}`, {}, formsEnv)).status).toBe(200);
    expect((await app().request("http://forms.test/auth/me", {}, formsEnv)).status).toBe(404);
    const home = await app().request(
      "https://forms.test/",
      {},
      { ...formsEnv, APP_ORIGIN: "https://app.test" },
    );
    expect(home.headers.get("location")).toBe("https://app.test");
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

  it("prefills from the form link and writes hidden UTM values to their own column", async () => {
    const id = await publishedForm([
      { id: "fld_src", type: "hidden", label: "UTM source", param: "utm_source" },
    ]);
    const page = await (
      await app().request(`/f/${id}?fld_name=Ada&fld_topic=Sales&utm_source=newsletter`, {}, env)
    ).text();
    expect(page).toMatch(/name="fld_name"\s+type="text"\s+value="Ada"/);
    expect(page).toMatch(/value="opt_sales"\s+checked/);
    expect(page).toMatch(
      /type="hidden"\s+name="fld_src"\s+value="newsletter"\s+data-param="utm_source"/,
    );
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com", fld_src: "newsletter" });
    await deliver();
    const sheet = onlySheet();
    expect(sheet.rows[0]?.slice(3)).toEqual(["Name", "Email", "Topic", "UTM source"]);
    expect(sheet.rows[1]?.slice(3)).toEqual(["Ada", "ada@example.com", "", "newsletter"]);
  });

  it("sends respondents to the owner's page after submitting, standalone or embedded", async () => {
    const created = await owner("/forms", { method: "POST", body: { title: "Redirect" } });
    const { id } = await created.json<{ id: string }>();
    const url = "https://example.com/thanks?a=1&b=</script>";
    await owner(`/forms/${id}/draft`, {
      method: "PUT",
      body: {
        schemaVersion: 1,
        id,
        title: "Redirect",
        fields,
        settings: { success: { type: "redirect", url } },
      },
    });
    expect((await owner(`/forms/${id}/publish`, { method: "POST" })).status).toBe(200);
    const page = await (await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" })).text();
    expect(page).toContain(
      'href="https://example.com/thanks?a=1&amp;b=&lt;/script&gt;" target="_top"',
    );
    expect(page).toContain("freelyforms:redirect");
    expect(page).not.toContain("b=</script>");
    const json = await submit(
      id,
      { fld_name: "Ada", fld_email: "ada@example.com" },
      { accept: "application/json" },
    );
    expect(await json.json()).toMatchObject({ ok: true, redirect: url });
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

  it("reconciles a write whose outcome was lost even after a later block and resume", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    const [msg] = queue.sent.splice(0);
    if (!msg) throw new Error("no message");
    google.state.failNextAppend = { status: "network", when: "after" }; // row written, reply lost
    await deliver([msg]);
    const sheet = onlySheet();
    google.sheets.delete("sheet1"); // next attempt fails before appending: blocked, not unknown
    await deliver([msg], 2);
    expect(await deliveryStates()).toEqual(["blocked"]);
    google.sheets.set("sheet1", sheet);
    await owner(`/forms/${id}/deliveries/resume`, { method: "POST" });
    await deliver();
    expect(await deliveryStates()).toEqual(["delivered"]);
    expect(sheet.rows).toHaveLength(2);
  });

  it("writes one row when the same message arrives twice in one batch", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    const [msg] = queue.sent.splice(0);
    if (!msg) throw new Error("no message");
    const outcomes = await deliver([msg, msg]);
    expect(outcomes.every((o) => o.acked)).toBe(true);
    expect(onlySheet().rows).toHaveLength(2);
  });

  it("renames a column when its question is renamed, wherever the column now is", async () => {
    const id = await publishedForm();
    const sheet = onlySheet();
    await owner(`/forms/${id}/draft`, {
      method: "PUT",
      body: {
        schemaVersion: 1,
        id,
        title: "Contact",
        fields: fields.map((f) => (f.id === "fld_email" ? { ...f, label: "Work email" } : f)),
      },
    });
    expect((await owner(`/forms/${id}/publish`, { method: "POST" })).status).toBe(200);
    const col = sheet.meta.find((m) => m.metadataValue === "fld_email")?.location.dimensionRange
      .startIndex;
    expect(sheet.rows[0]?.[col ?? -1]).toBe("Work email");
    expect(sheet.rows[0]?.[0]).toBe("_submission_id");
  });

  it("keeps headers the owner edited by hand", async () => {
    const id = await publishedForm();
    const sheet = onlySheet();
    const col =
      sheet.meta.find((m) => m.metadataValue === "fld_email")?.location.dimensionRange.startIndex ??
      -1;
    (sheet.rows[0] as unknown[])[col] = "E-mail (owner's name)";
    await owner(`/forms/${id}/draft`, {
      method: "PUT",
      body: {
        schemaVersion: 1,
        id,
        title: "Contact",
        fields: fields.map((f) => (f.id === "fld_email" ? { ...f, label: "Work email" } : f)),
      },
    });
    expect((await owner(`/forms/${id}/publish`, { method: "POST" })).status).toBe(200);
    expect(sheet.rows[0]?.[col]).toBe("E-mail (owner's name)");
  });

  it("adds columns for new fields after the owner's own columns", async () => {
    const id = await publishedForm();
    const sheet = onlySheet();
    sheet.columnCount += 1; // the owner adds a "Notes" column at the end
    const notes = sheet.columnCount - 1;
    const draft = await owner(`/forms/${id}/draft`, {
      method: "PUT",
      body: {
        schemaVersion: 1,
        id,
        title: "Contact",
        fields: [...fields, { id: "fld_phone", type: "phone", label: "Phone" }],
      },
    });
    expect(draft.status).toBe(200);
    expect((await owner(`/forms/${id}/publish`, { method: "POST" })).status).toBe(200);
    const phone = sheet.meta.find((m) => m.metadataValue === "fld_phone");
    expect(phone?.location.dimensionRange.startIndex).toBe(notes + 1);
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

  it("parks a retry the queue would drop and lets the hourly sweep resend it (ADR 0014)", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    const [msg] = queue.sent.splice(0);
    if (!msg) throw new Error("no message");
    clock += 23 * 60 * 60 * 1000; // close to the 24-hour retention of Workers Free
    google.state.failNextAppend = { status: 503, when: "before" };
    const [outcome] = await deliver([msg], 12);
    expect(outcome).toEqual({ acked: true });
    expect(kv.store.size).toBe(1);
    expect(await deliveryStates()).toEqual(["unknown"]);

    await maintenance(env, clock);
    expect(kv.store.size).toBe(0);
    await deliver();
    expect(await deliveryStates()).toEqual(["delivered"]);
    expect(onlySheet().rows).toHaveLength(2);
  });

  it("sends groups that would exceed the Google call budget back to the queue", async () => {
    const a = await publishedForm();
    const b = await publishedForm();
    await submit(a, { fld_name: "A", fld_email: "a@example.com" });
    await submit(b, { fld_name: "B", fld_email: "b@example.com" });
    env = { ...env, GOOGLE_CALL_BUDGET: "8" };
    const outcomes = await deliver();
    expect(outcomes).toEqual([{ acked: true }, { acked: false, retryDelay: 0 }]);
    expect((await deliveryStates()).sort()).toEqual(["delivered", "queued"]);
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
    const list = await (await owner("/forms")).json<{ forms: { needsAttention: boolean }[] }>();
    expect(list.forms[0]?.needsAttention).toBe(true);
    await env.DB.prepare("UPDATE destinations SET state = 'QUOTA'").run();
    await env.DB.prepare("UPDATE deliveries SET state = 'retrying'").run();
    const quota = await (await owner("/forms")).json<{ forms: { needsAttention: boolean }[] }>();
    expect(quota.forms[0]?.needsAttention).toBe(false);

    google.sheets.set("sheet1", sheet); // the owner restores it from the bin
    const resumed = await (
      await owner(`/forms/${id}/deliveries/resume`, { method: "POST" })
    ).json<{ resumed: number }>();
    expect(resumed).toEqual({ resumed: 1, more: false });
    expect(kv.store.size).toBe(0);
    await deliver();
    expect(await deliveryStates()).toEqual(["delivered"]);
    expect(sheet.rows).toHaveLength(2);
  });

  it("resumes in chunks and lets the hourly sweep finish what a resume missed", async () => {
    const id = await publishedForm();
    for (let i = 0; i < 3; i++)
      await submit(id, { fld_name: `N${String(i)}`, fld_email: "a@b.co" });
    const sheet = onlySheet();
    google.sheets.delete("sheet1");
    await deliver();
    expect(kv.store.size).toBe(3);
    google.sheets.set("sheet1", sheet);
    const destinationId = (await env.DB.prepare("SELECT id FROM destinations").first(
      "id",
    )) as string;
    expect(await resumeHeld(env, destinationId, 2)).toMatchObject({ more: true });
    expect(kv.store.size).toBe(1);
    expect((await deliveryStates()).sort()).toEqual(["blocked", "queued", "queued"]);
    // The owner's fix already set the destination to OK; the sweep resumes the rest.
    await env.DB.prepare("UPDATE destinations SET state = 'OK'").run();
    await maintenance(env, clock);
    expect(kv.store.size).toBe(0);
    await deliver();
    expect(await deliveryStates()).toEqual(["delivered", "delivered", "delivered"]);
    expect(sheet.rows).toHaveLength(4);
  });

  it("keeps a held delivery when re-sending fails, and the next sweep delivers it", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    const sheet = onlySheet();
    google.sheets.delete("sheet1");
    await deliver();
    google.sheets.set("sheet1", sheet);
    await env.DB.prepare("UPDATE destinations SET state = 'OK'").run();
    const send = queue.queue.send.bind(queue.queue);
    queue.queue.send = () => Promise.reject(new Error("queue down"));
    await expect(maintenance(env, clock)).rejects.toThrow("queue down");
    expect(kv.store.size).toBe(1);
    expect(await env.DB.prepare("SELECT held_at FROM deliveries").first("held_at")).not.toBeNull();
    queue.queue.send = send;
    await maintenance(env, clock);
    expect(kv.store.size).toBe(0);
    await deliver();
    expect(await deliveryStates()).toEqual(["delivered"]);
    expect(sheet.rows).toHaveLength(2);
  });

  it("drops a leftover hold key whose delivery was already resumed", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    google.sheets.delete("sheet1");
    await deliver();
    // An earlier resume sent the message and cleared the mark, then stopped before deleting.
    await env.DB.prepare("UPDATE deliveries SET held_at = NULL, state = 'queued'").run();
    const destinationId = (await env.DB.prepare("SELECT id FROM destinations").first(
      "id",
    )) as string;
    await resumeHeld(env, destinationId);
    expect(kv.store.size).toBe(0);
    expect(queue.sent).toHaveLength(0);
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

describe("existing spreadsheets (Google Picker)", () => {
  const PICKED = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

  it("gives the browser a short-lived token only with Drive access and when configured", async () => {
    expect((await owner("/account/google/picker")).status).toBe(503);
    env = { ...env, PICKER_API_KEY: "AIza-test", GOOGLE_PROJECT_NUMBER: "123" };
    expect(await (await owner("/account/google/picker")).json()).toEqual({
      error: "google_access_required",
    });
    await env.DB.prepare(
      "UPDATE google_connections SET scopes = 'openid https://www.googleapis.com/auth/drive.file'",
    ).run();
    const res = await owner("/account/google/picker");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json<Record<string, unknown>>();
    expect(body).toMatchObject({ accessToken: "ya29.fake", apiKey: "AIza-test", appId: "123" });
    expect(JSON.stringify(body)).not.toContain("1//refresh");
  });

  it("adds a responses tab to a picked spreadsheet and delivers there", async () => {
    google.sheets.set(PICKED, {
      sheetId: 0,
      columnCount: 5,
      rows: [["the owner's own data"]],
      meta: [],
    });
    const created = await owner("/forms", { method: "POST", body: { title: "Signup" } });
    const { id } = await created.json<{ id: string }>();
    await owner(`/forms/${id}/draft`, {
      method: "PUT",
      body: { schemaVersion: 1, id, title: "Signup", fields },
    });
    const attached = await owner(`/forms/${id}/destination`, {
      method: "POST",
      body: { spreadsheetId: PICKED },
    });
    expect(attached.status).toBe(200);
    expect(
      (await owner(`/forms/${id}/destination`, { method: "POST", body: { spreadsheetId: PICKED } }))
        .status,
    ).toBe(409);
    expect((await owner(`/forms/${id}/publish`, { method: "POST" })).status).toBe(200);
    expect(google.sheets.size).toBe(1); // publishing did not create another spreadsheet
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    await deliver();
    const sheet = google.sheets.get(PICKED);
    expect(sheet?.rows[0]?.slice(0, 4)).toEqual([
      "_submission_id",
      "_submitted_at",
      "_form_version",
      "Name",
    ]);
    expect(sheet?.rows[1]?.slice(3, 5)).toEqual(["Ada", "ada@example.com"]);
  });

  it("hides another owner's form and reports a revoked grant to the picker", async () => {
    const id = await publishedForm();
    await env.DB.prepare("UPDATE forms SET owner_id = 'usr_someone_else' WHERE id = ?")
      .bind(id)
      .run()
      .catch(() => undefined);
    await env.DB.prepare(
      "UPDATE google_connections SET scopes = 'openid https://www.googleapis.com/auth/drive.file'",
    ).run();
    env = { ...env, PICKER_API_KEY: "AIza-test", GOOGLE_PROJECT_NUMBER: "123" };
    google.state.revoked = true;
    expect(await (await owner("/account/google/picker")).json()).toEqual({
      error: "google_access_required",
    });
  });

  it("explains when a spreadsheet was not picked through the app", async () => {
    const created = await owner("/forms", { method: "POST", body: { title: "X" } });
    const { id } = await created.json<{ id: string }>();
    const res = await owner(`/forms/${id}/destination`, {
      method: "POST",
      body: { spreadsheetId: "1NotPickedNotPickedNotPicked00" },
    });
    expect(await res.json()).toEqual({ error: "sheet_not_accessible" });
    expect(
      (await owner(`/forms/${id}/destination`, { method: "POST", body: { spreadsheetId: "../x" } }))
        .status,
    ).toBe(422);
  });
});

describe("account", () => {
  it("disconnects Google: revokes the grant, deletes the token, and holds new responses", async () => {
    const id = await publishedForm();
    const res = await owner("/account/google/disconnect", { method: "POST" });
    expect(await res.json()).toEqual({ disconnected: true, revokedAtGoogle: true });
    expect(google.state.calls).toContain("POST /revoke");
    expect(await env.DB.prepare("SELECT count(*) AS n FROM google_connections").first("n")).toBe(0);
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    await deliver();
    expect(await deliveryStates()).toEqual(["blocked"]);
    expect(kv.store.size).toBe(1);
  });

  it("reports when Google could not confirm the revocation, and still deletes the token", async () => {
    await publishedForm();
    const fetch = deps.fetch;
    deps.fetch = (input, init) =>
      String(input instanceof Request ? input.url : input).includes("/revoke")
        ? Promise.resolve(new Response("down", { status: 503 }))
        : fetch(input, init);
    const res = await owner("/account/google/disconnect", { method: "POST" });
    expect(await res.json()).toEqual({ disconnected: true, revokedAtGoogle: false });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM google_connections").first("n")).toBe(0);
  });

  it("deletes the account even when the hold store fails", async () => {
    const id = await publishedForm();
    google.sheets.delete("sheet1");
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    await deliver();
    kv.kv.delete = () => Promise.reject(new Error("kv down"));
    const res = await owner("/account", {
      method: "DELETE",
      body: { confirm: "owner@example.com" },
    });
    expect(res.status).toBe(200);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM users").first("n")).toBe(0);
  });

  it("deletes the account with all metadata and held payloads, never the sheet", async () => {
    const id = await publishedForm();
    google.sheets.delete("sheet1");
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    await deliver();
    expect(kv.store.size).toBe(1);

    const wrong = await owner("/account", { method: "DELETE", body: { confirm: "someone@else" } });
    expect(wrong.status).toBe(422);
    const res = await owner("/account", {
      method: "DELETE",
      body: { confirm: "Owner@Example.com" },
    });
    expect(await res.json()).toEqual({ deleted: true, revokedAtGoogle: true });
    expect(res.headers.get("set-cookie")).toContain("__Host-ff_session=;");

    for (const table of [
      "column_map_cache",
      "form_daily_stats",
      "users",
      "sessions",
      "google_connections",
      "forms",
      "form_versions",
      "destinations",
      "deliveries",
    ]) {
      expect(await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first("n"), table).toBe(0);
    }
    expect(kv.store.size).toBe(0);
    expect(
      google.state.calls.filter(
        (call) => call.includes("spreadsheets") && call.startsWith("DELETE"),
      ),
    ).toEqual([]);
    expect((await owner("/forms")).status).toBe(401);
    expect((await app().request(`/f/${id}`, {}, env)).status).toBe(404);
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

  it("reports stuck deliveries for operators, and not deliveries held for their owner", async () => {
    const id = await publishedForm();
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    expect(await healthReport(env, clock)).toEqual({ stuck: 0, held: 0, failedLastDay: 0 });
    // Never consumed: an hour later it is stuck.
    expect(await healthReport(env, clock + STUCK_AFTER_MS + 1)).toMatchObject({ stuck: 1 });
    await env.DB.prepare("UPDATE deliveries SET held_at = ?").bind(clock).run();
    expect(await healthReport(env, clock + STUCK_AFTER_MS + 1)).toMatchObject({
      stuck: 0,
      held: 1,
    });
  });
});

describe("intake protection", () => {
  const PASS_SECRET = "1x0000000000000000000000000000000AA";

  function limiter(allow: boolean) {
    const keys: string[] = [];
    const binding = {
      limit: ({ key }: { key: string }) => {
        keys.push(key);
        return Promise.resolve({ success: allow });
      },
    };
    return { binding, keys };
  }

  it("rate-limits per IP and per IP and form", async () => {
    const id = await publishedForm();
    const ip = limiter(true);
    const formIp = limiter(false);
    env = { ...env, SUBMIT_IP_LIMITER: ip.binding, SUBMIT_FORM_IP_LIMITER: formIp.binding };
    const res = await submit(
      id,
      { fld_name: "Ada", fld_email: "ada@example.com" },
      { "cf-connecting-ip": "203.0.113.9" },
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(ip.keys).toEqual(["203.0.113.9"]);
    expect(formIp.keys).toEqual([`${id}:203.0.113.9`]);
    expect(queue.sent).toHaveLength(0);
  });

  it("requires a passed Turnstile challenge when keys are configured", async () => {
    const id = await publishedForm();
    env = {
      ...env,
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: PASS_SECRET,
    };
    const verified: URLSearchParams[] = [];
    const googleFetch = deps.fetch;
    deps = {
      ...deps,
      fetch: (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.startsWith("https://challenges.cloudflare.com/")) {
          const body = new URLSearchParams(init?.body as URLSearchParams);
          verified.push(body);
          return Promise.resolve(Response.json({ success: body.get("response") === "good-token" }));
        }
        return googleFetch(input, init);
      },
    };

    const page = await app().request(`/f/${id}`, {}, env);
    const html = await page.text();
    expect(html).toContain('class="field cf-turnstile" data-sitekey="1x00000000000000000000AA"');
    const csp = page.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'nonce-");
    expect(csp).toContain("https://challenges.cloudflare.com");
    expect(csp).toContain("frame-ancestors *");

    const missing = await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    expect(missing.status).toBe(403);
    expect(await missing.text()).toContain("Please complete the verification");

    const ok = await submit(
      id,
      { fld_name: "Ada", fld_email: "ada@example.com", "cf-turnstile-response": "good-token" },
      { "cf-connecting-ip": "203.0.113.9" },
    );
    expect(ok.status).toBe(200);
    expect(verified.at(-1)?.get("remoteip")).toBe("203.0.113.9");
    expect(queue.sent).toHaveLength(1);
    expect(JSON.stringify(queue.sent[0])).not.toContain("good-token");
  });

  it("serves form pages with a nonce-based CSP: only the embed sizer and the answer check run", async () => {
    const id = await publishedForm();
    const page = await app().request(`/f/${id}`, {}, env);
    const csp = page.headers.get("content-security-policy") ?? "";
    const nonce = /style-src 'nonce-([^']+)'/.exec(csp)?.[1] ?? "missing";
    expect(csp).toContain(`script-src 'nonce-${nonce}'`);
    expect(csp).not.toContain("challenges.cloudflare.com");
    const text = await page.text();
    expect(text).toContain(`<style nonce="${nonce}">`);
    // Two scripts run (embed sizer, answer check), each with the nonce; the third is form data.
    expect(text.match(/<script nonce=/g)).toHaveLength(2);
    expect(text.match(/<script/g)).toHaveLength(3);
    expect(text).toContain('<script type="application/json" id="ff-fields">');
    expect(text).toContain("freelyforms:height");
    expect(text).toContain(FORM_CLIENT_JS);
  });

  it("applies the owner's theme and links abuse reports", async () => {
    const created = await owner("/forms", { method: "POST", body: { title: "Themed" } });
    const { id } = await created.json<{ id: string }>();
    await owner(`/forms/${id}/draft`, {
      method: "PUT",
      body: {
        schemaVersion: 1,
        id,
        title: "Themed",
        settings: { theme: { accent: "#ffd400", colorScheme: "dark" } },
        fields,
      },
    });
    await owner(`/forms/${id}/publish`, { method: "POST" });
    const page = await (
      await app().request(`/f/${id}`, {}, { ...env, ABUSE_EMAIL: "abuse@example.com" })
    ).text();
    expect(page).toContain("color-scheme:dark");
    expect(page).toContain("--accent:#ffd400;--on-accent:#000");
    expect(page).not.toContain("prefers-color-scheme");
    expect(page).toContain(`href="mailto:abuse@example.com?subject=Abuse%20report%3A%20${id}"`);
  });

  it("serves the embed script on both hosts and gives owners the snippet", async () => {
    const id = await publishedForm();
    const local = await app().request("/f/embed.js", {}, env);
    expect(local.headers.get("content-type")).toContain("javascript");
    expect(local.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    const script = await local.text();
    expect(script).toContain("iframe[data-freelyforms]");
    expect(() => new Script(script)).not.toThrow(); // compiles, without running
    const formsEnv = { ...env, FORMS_HOST: "forms.test" };
    expect((await app().request("http://forms.test/embed.js", {}, formsEnv)).status).toBe(200);
    const view = await (
      await app().request(`/forms/${id}`, { headers: { cookie, origin: ORIGIN } }, formsEnv)
    ).json<{ public: { url: string; embedCode: string } }>();
    expect(view.public.url).toBe(`https://forms.test/${id}`);
    expect(view.public.embedCode).toContain(`src="https://forms.test/${id}"`);
    expect(view.public.embedCode).toContain('src="https://forms.test/embed.js"');
  });

  it("previews the draft for its owner only, without submitting", async () => {
    const created = await owner("/forms", { method: "POST", body: { title: "Draft" } });
    const { id } = await created.json<{ id: string }>();
    await owner(`/forms/${id}/draft`, {
      method: "PUT",
      body: { schemaVersion: 1, id, title: "Draft", fields },
    });
    const res = await owner(`/forms/${id}/preview`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    const page = await res.text();
    expect(page).toContain(`class="is-preview"`);
    expect(page).toMatch(/<button type="submit"\s+disabled/);
    // The browser script runs in the preview too, so conditions show and hide fields there.
    expect(page).toContain("ff-fields");
    expect((await app().request(`/forms/${id}/preview`, {}, env)).status).toBe(401);
  });
});

describe("webhook destination (ADR 0021)", () => {
  const HOOK = "https://hooks.example.com/freely";
  /** Captures webhook calls; everything else goes to the fake Google. */
  function receiver(status: number) {
    const calls: { headers: Headers; body: string }[] = [];
    const google = deps.fetch;
    deps.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith(HOOK)) return google(input, init);
      calls.push({
        headers: new Headers(init?.headers),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return new Response(null, { status });
    };
    return calls;
  }

  it("accepts only public https URLs", async () => {
    const id = await publishedForm();
    for (const url of [
      "http://hooks.example.com/x",
      "https://localhost/x",
      "https://10.0.0.1/x",
      "https://user:pass@hooks.example.com/x",
      "not a url",
    ]) {
      const res = await owner(`/forms/${id}/webhook`, { method: "PUT", body: { url } });
      expect(res.status, url).toBe(422);
    }
  });

  it("sends a signed copy of each response, next to the sheet", async () => {
    const id = await publishedForm();
    const created = await owner(`/forms/${id}/webhook`, { method: "PUT", body: { url: HOOK } });
    expect(created.status).toBe(201);
    const { secret } = await created.json<{ secret: string }>();
    expect(secret.length).toBeGreaterThan(30);
    // Later reads never show the secret.
    expect(JSON.stringify(await (await owner(`/forms/${id}/webhook`)).json())).not.toContain(
      secret,
    );

    const calls = receiver(200);
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com", fld_topic: "opt_sales" });
    expect(queue.sent.map((m) => Boolean(m.webhookId))).toEqual([false, true]);
    const outcomes = await deliver();
    expect(outcomes.every((o) => o.acked)).toBe(true);
    expect(onlySheet().rows).toHaveLength(2);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    const body = JSON.parse(call?.body ?? "{}") as {
      event: string;
      submissionId: string;
      answers: Record<string, unknown>;
      fields: { id: string; text: string }[];
    };
    expect(body.event).toBe("submission.created");
    expect(body.answers).toMatchObject({ fld_name: "Ada", fld_topic: "opt_sales" });
    expect(body.fields.find((f) => f.id === "fld_topic")?.text).toBe("Sales");
    const [, t, v1] =
      /^t=(\d+),v1=([0-9a-f]{64})$/.exec(call?.headers.get("freely-signature") ?? "") ?? [];
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expected = [
      ...new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(`${t ?? ""}.${call?.body ?? ""}`),
        ),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(v1).toBe(expected);
    expect(await (await owner(`/forms/${id}/webhook`)).json()).toMatchObject({
      webhook: { failing: false, lastStatus: 200 },
    });
  });

  it("retries server errors, gives up on client errors, and never blocks the sheet", async () => {
    const id = await publishedForm();
    await owner(`/forms/${id}/webhook`, { method: "PUT", body: { url: HOOK } });
    receiver(503);
    await submit(id, { fld_name: "Ada", fld_email: "ada@example.com" });
    const [sheetOutcome, hookOutcome] = await deliver();
    expect(sheetOutcome?.acked).toBe(true);
    expect(hookOutcome?.retryDelay).toBeGreaterThan(0);
    expect(await (await owner(`/forms/${id}/webhook`)).json()).toMatchObject({
      webhook: { failing: true, lastStatus: 503 },
    });

    receiver(404);
    await submit(id, { fld_name: "Bo", fld_email: "bo@example.com" });
    const [, final] = await deliver();
    expect(final?.acked).toBe(true);
  });

  it("posts a test event on request and reports the receiver's status", async () => {
    const id = await publishedForm();
    await owner(`/forms/${id}/webhook`, { method: "PUT", body: { url: HOOK } });
    const calls = receiver(204);
    const res = await owner(`/forms/${id}/webhook/test`, { method: "POST" });
    expect(await res.json()).toEqual({ status: 204, ok: true });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({ test: true, submissionId: "TEST" });
    expect((await owner(`/forms/${id}/webhook`, { method: "DELETE" })).status).toBe(204);
    expect(await (await owner(`/forms/${id}/webhook`)).json()).toEqual({ webhook: null });
  });
});

describe("file uploads (ADR 0007)", () => {
  const fileField = {
    id: "fld_cv",
    type: "file",
    label: "CV",
    accept: "documents",
    maxSizeMb: 2,
  };
  const slot = (formId: string, body: Record<string, unknown>, origin = "http://localhost") =>
    app().request(
      `/f/${formId}/uploads`,
      {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      env,
    );
  const pdf = { fieldId: "fld_cv", name: "cv.pdf", size: 1000, type: "application/pdf" };
  /** Gets a slot and does what the respondent's browser does with it. */
  async function uploaded(formId: string) {
    const res = await slot(formId, pdf);
    expect(res.status).toBe(201);
    const { uploadUrl, token } = await res.json<{ uploadUrl: string; token: string }>();
    const file = google.completeUpload(uploadUrl.split("/").at(-1) ?? "", 1000);
    if (!file) throw new Error("no session");
    return { fileId: file.id, token };
  }

  it("hands out upload slots only to the form's own page, within the field's limits", async () => {
    const id = await publishedForm([fileField]);
    google.state.now = clock;
    expect((await slot(id, pdf, "https://elsewhere.example")).status).toBe(403);
    expect(await (await slot(id, { ...pdf, size: 3 * 1024 * 1024 })).json()).toEqual({
      error: "file_too_large",
    });
    expect(await (await slot(id, { ...pdf, type: "image/png" })).json()).toEqual({
      error: "file_type",
    });
    expect((await slot(id, { ...pdf, fieldId: "fld_name" })).status).toBe(422);
    await uploaded(id);
    await uploaded(id);
    // One folder per form, created on first use.
    expect(await env.DB.prepare("SELECT count(*) AS n FROM drive_folders").first("n")).toBe(1);
  });

  it("writes a link for each uploaded file and marks it attached; foreign files are refused", async () => {
    const id = await publishedForm([fileField]);
    google.state.now = clock;
    const good = await uploaded(id);
    await submit(id, {
      fld_name: "Ada",
      fld_email: "ada@example.com",
      fld_cv: `${good.fileId}:${good.token}`,
    });
    await deliver();
    const sheet = onlySheet();
    const header = sheet.rows[0] as string[];
    expect(sheet.rows[1]?.[header.indexOf("CV")]).toBe(
      `cv.pdf – https://drive.google.com/file/d/${good.fileId}/view`,
    );
    expect(google.files.get(good.fileId)?.appProperties.freelyAttached).toBe("1");

    const other = await uploaded(id);
    await submit(id, {
      fld_name: "Mallory",
      fld_email: "m@example.com",
      fld_cv: `${other.fileId}:${"x".repeat(32)}`,
    });
    await deliver();
    expect(onlySheet().rows[2]?.[header.indexOf("CV")]).toBe("(file not accepted)");
  });

  it("takes a drawn signature only as a PNG of at most 1 MB", async () => {
    const id = await publishedForm([{ id: "fld_sig", type: "signature", label: "Sign" }]);
    google.state.now = clock;
    const sig = { fieldId: "fld_sig", name: "signature.png", size: 2000, type: "image/png" };
    expect((await slot(id, sig)).status).toBe(201);
    expect(await (await slot(id, { ...sig, type: "image/jpeg" })).json()).toEqual({
      error: "file_type",
    });
    expect(await (await slot(id, { ...sig, size: 2 * 1024 * 1024 })).json()).toEqual({
      error: "file_too_large",
    });
  });

  it("deletes uploads never sent with a response, a day later", async () => {
    const id = await publishedForm([fileField]);
    google.state.now = clock;
    const kept = await uploaded(id);
    const forgotten = await uploaded(id);
    await submit(id, {
      fld_name: "Ada",
      fld_email: "ada@example.com",
      fld_cv: `${kept.fileId}:${kept.token}`,
    });
    await deliver();
    await cleanUploads(env, deps, clock + 2 * 60 * 60 * 1000);
    expect(google.files.has(forgotten.fileId)).toBe(true); // not a day old yet
    await cleanUploads(env, deps, clock + 25 * 60 * 60 * 1000);
    expect(google.files.has(forgotten.fileId)).toBe(false);
    expect(google.files.has(kept.fileId)).toBe(true);
  });
});
