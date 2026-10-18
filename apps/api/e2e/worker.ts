/**
 * The Worker as end-to-end tests run it: the real app, queue consumer and cron, with Google's
 * token and Sheets endpoints answered by the in-memory fake from the unit tests, plus two
 * test-only routes. Never deployed: only e2e/wrangler.jsonc points at this file.
 */
import { encrypt } from "@freelyforms/crypto";
import { Hono } from "hono";
import { createApp } from "../src/app.js";
import { DRIVE_FILE_SCOPE } from "../src/auth/google.js";
import { startSession } from "../src/auth/session.js";
import { maintenance, processBatch } from "../src/delivery/consumer.js";
import type { DeliveryMessage, Deps, Env } from "../src/env.js";
import { keyringFor } from "../src/keys.js";
import { newId } from "../src/util.js";
import { fakeGoogle } from "../test/fake-google.js";

const google = fakeGoogle();
/** Webhook bodies sent to the test receiver (ADR 0021). */
const hooks: { signature: string | null; body: unknown }[] = [];
const GOOGLE_HOSTS = new Set(["oauth2.googleapis.com", "sheets.googleapis.com"]);

const deps: Deps = {
  fetch: (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.hostname === "hooks.e2e.test") {
      hooks.push({
        signature: new Headers(init?.headers).get("freely-signature"),
        body: JSON.parse(typeof init?.body === "string" ? init.body : "null") as unknown,
      });
      return Promise.resolve(new Response(null, { status: 200 }));
    }
    // Turnstile's siteverify stays real: the test keys in e2e/wrangler.jsonc always pass.
    return GOOGLE_HOSTS.has(url.hostname) ? google.fetchFn(input, init) : fetch(input, init);
  },
  now: () => Date.now(),
};

const app = createApp(deps);
const testRoutes = new Hono<{ Bindings: Env }>();

/** Signs in as a test owner with Drive access, as if Google sign-in had just completed. */
testRoutes.get("/__e2e/login", async (c) => {
  const email = c.req.query("email") ?? "owner@example.com";
  const now = Date.now();
  let user = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!user) {
    user = { id: newId("usr") };
    await c.env.DB.prepare(
      "INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(user.id, `sub-${email}`, email, "Test Owner", now)
      .run();
  }
  const token = await encrypt(
    await keyringFor(c.env),
    "1//e2e-refresh",
    `google-refresh:${user.id}`,
  );
  await c.env.DB.prepare(
    `INSERT INTO google_connections (id, user_id, scopes, refresh_token, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET scopes = excluded.scopes,
       refresh_token = excluded.refresh_token, status = 'active', updated_at = excluded.updated_at`,
  )
    .bind(
      newId("gc"),
      user.id,
      `openid email profile ${DRIVE_FILE_SCOPE}`,
      JSON.stringify(token),
      now,
      now,
    )
    .run();
  await startSession(c, user.id, now);
  return c.redirect(c.req.query("next") ?? "/app/", 302);
});

/** Rows the fake Google holds for a spreadsheet (header first). */
testRoutes.get("/__e2e/sheets/:id", (c) => {
  const sheet = google.sheets.get(c.req.param("id"));
  return sheet ? c.json(sheet.rows) : c.json({ error: "not_found" }, 404);
});

/** Webhook bodies the test receiver got, oldest first. */
testRoutes.get("/__e2e/webhooks", (c) => c.json(hooks));

/**
 * An owner's page with the given embed code. Tests open it on 127.0.0.1, a different origin from
 * the forms on localhost, as a real owner's site would be.
 */
testRoutes.get("/__e2e/owner-site", (c) =>
  c.html(`<!doctype html><title>Owner site</title><h1>Sign up</h1>${c.req.query("code") ?? ""}`),
);

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
    new URL(request.url).pathname.startsWith("/__e2e/")
      ? testRoutes.fetch(request, env, ctx)
      : app.fetch(request, env, ctx),
  queue: (batch: MessageBatch<DeliveryMessage>, env: Env) => processBatch(batch, env, deps),
  scheduled: (_controller: ScheduledController, env: Env) => maintenance(env, Date.now()),
} satisfies ExportedHandler<Env, DeliveryMessage>;
