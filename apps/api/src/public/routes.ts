import { encrypt } from "@freelyforms/crypto";
import { validateSubmission } from "@freelyforms/form-engine";
import { parseForm, type Form } from "@freelyforms/form-schema";
import { PAYLOAD_RETENTION_MS } from "@freelyforms/db";
import { Hono, type Context } from "hono";
import type { DeliveryMessage, Deps, Env } from "../env.js";
import { keyringFor } from "../keys.js";
import { randomToken, readBodyLimited, ulid } from "../util.js";
import {
  formPageCsp,
  TURNSTILE_FIELD,
  turnstileEnabled,
  verifyTurnstile,
  withinRateLimits,
} from "./protect.js";
import { prefillValues } from "./prefill.js";
import { renderForm, renderMessage, renderRedirect, type PageOptions } from "./render.js";

/** Cloudflare Queues rejects messages over 128 KB; keep a margin for metadata and encryption. */
const MAX_BODY_BYTES = 64 * 1024;

type PublicEnv = { Bindings: Env; Variables: { page: PageOptions } };
type Ctx = Context<PublicEnv>;

interface Published {
  form: Form;
  version: number;
}

async function published(c: Ctx, formId: string): Promise<Published | null> {
  const row = await c.env.DB.prepare(
    `SELECT v.schema_json, v.version FROM forms f
     JOIN form_versions v ON v.form_id = f.id AND v.version = f.published_version
     JOIN destinations d ON d.form_id = f.id
     WHERE f.id = ? AND f.status = 'published'`,
  )
    .bind(formId)
    .first<{ schema_json: string; version: number }>();
  if (!row) return null;
  const parsed = parseForm(JSON.parse(row.schema_json));
  return parsed.success ? { form: parsed.form, version: row.version } : null;
}

/** Why a body was refused; each maps to a JSON error and status. */
type BodyProblem = "too_large" | "invalid_body";

/**
 * Reads urlencoded, multipart or JSON bodies (at most MAX_BODY_BYTES, counted while reading) into
 * `{ name: value | value[] }`.
 */
async function readAnswers(c: Ctx): Promise<Record<string, unknown> | BodyProblem> {
  const bytes = await readBodyLimited(c.req.raw, MAX_BODY_BYTES);
  if (!bytes) return "too_large";
  const type = c.req.header("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      const body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      return body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : "invalid_body";
    } catch {
      return "invalid_body";
    }
  }
  if (!type.includes("application/x-www-form-urlencoded") && !type.includes("multipart/form-data"))
    return "invalid_body";
  const form = await new Response(bytes, { headers: { "content-type": type } })
    .formData()
    .catch(() => null);
  if (!form) return "invalid_body";
  const answers: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    const values = form.getAll(key);
    // Files are not accepted yet (ADR 0007 is still a proposal).
    if (values.some((v) => typeof v !== "string")) return "invalid_body";
    answers[key] = values.length === 1 ? values[0] : values;
  }
  return answers;
}

const wantsJson = (c: Ctx) => (c.req.header("accept") ?? "").includes("application/json");

export function publicRoutes(deps: Deps): Hono<PublicEnv> {
  const pub = new Hono<PublicEnv>();

  pub.use(async (c, next) => {
    const nonce = randomToken(16);
    const turnstile = turnstileEnabled(c.env);
    // A site key without its secret silently disables the challenge: make that visible.
    if (!turnstile && c.env.TURNSTILE_SITE_KEY) console.error("turnstile_secret_missing");
    c.set("page", {
      nonce,
      turnstileSiteKey: turnstile ? c.env.TURNSTILE_SITE_KEY : undefined,
      abuseEmail: c.env.ABUSE_EMAIL,
      // Forms on the forms domain link the policy on the app domain; in development, same origin.
      privacyUrl: `${c.env.APP_ORIGIN ?? ""}/privacy`,
    });
    await next();
    c.header("X-Robots-Tag", "noindex");
    c.header("Cache-Control", "no-store");
    c.header("Content-Security-Policy", formPageCsp(nonce, turnstile));
  });

  pub.get("/:formId", async (c) => {
    const found = await published(c, c.req.param("formId"));
    if (!found) {
      return c.html(
        renderMessage(
          "Form not found",
          "This form does not exist or is not accepting responses.",
          c.var.page,
        ),
        404,
      );
    }
    const values = prefillValues(found.form, new URL(c.req.url).searchParams);
    return c.html(renderForm(found.form, c.req.path, c.var.page, { values }));
  });

  pub.post("/:formId", async (c) => {
    const found = await published(c, c.req.param("formId"));
    if (!found) return c.json({ error: "not_found" }, 404);
    const ip = c.req.header("cf-connecting-ip");
    if (!(await withinRateLimits(c.env, found.form.id, ip))) {
      c.header("Retry-After", "60");
      if (wantsJson(c)) return c.json({ error: "rate_limited" }, 429);
      return c.html(
        renderMessage(
          found.form.title,
          "Too many submissions from your network. Please try again in a minute.",
          c.var.page,
          found.form,
        ),
        429,
      );
    }
    const answers = await readAnswers(c);
    if (answers === "too_large") return c.json({ error: "too_large" }, 413);
    if (answers === "invalid_body") return c.json({ error: "invalid_body" }, 400);

    const { form, version } = found;
    const after = form.settings?.success;
    const redirect = after?.type === "redirect" ? { redirect: after.url } : {};
    if (!(await verifyTurnstile(c.env, deps, answers[TURNSTILE_FIELD], ip))) {
      if (wantsJson(c)) return c.json({ error: "challenge_failed" }, 403);
      return c.html(
        renderForm(form, c.req.path, c.var.page, {
          values: answers,
          notice: "Please complete the verification and submit again.",
        }),
        403,
      );
    }
    // Honeypot: bots fill every field. Pretend success so they learn nothing.
    const bot = typeof answers._hp === "string" && answers._hp !== "";
    const result = validateSubmission(form, answers);
    if (!result.ok && !bot) {
      if (wantsJson(c)) return c.json({ error: "invalid", errors: result.errors }, 422);
      return c.html(
        renderForm(form, c.req.path, c.var.page, { values: answers, errors: result.errors }),
        422,
      );
    }

    if (!bot && result.ok) {
      const now = deps.now();
      const submissionId = ulid(now);
      const payload = await encrypt(
        await keyringFor(c.env),
        JSON.stringify({ values: result.values }),
        `submission:${submissionId}`,
      );
      const message: DeliveryMessage = {
        submissionId,
        formId: form.id,
        formVersion: version,
        submittedAt: now,
        payload,
      };
      if (JSON.stringify(message).length > MAX_BODY_BYTES * 1.5)
        return c.json({ error: "too_large" }, 413);
      await c.env.DB.prepare(
        "INSERT INTO deliveries (submission_id, form_id, form_version, state, accepted_at, expires_at) VALUES (?, ?, ?, 'accepted', ?, ?)",
      )
        .bind(submissionId, form.id, version, now, now + PAYLOAD_RETENTION_MS)
        .run();
      await c.env.DELIVERY_QUEUE.send(message, { contentType: "json" });
      // A copy for the form's webhook, if it has one (ADR 0021).
      const hook = await c.env.DB.prepare("SELECT id FROM webhooks WHERE form_id = ?")
        .bind(form.id)
        .first<{ id: string }>();
      if (hook) {
        await c.env.DELIVERY_QUEUE.send(
          { ...message, webhookId: hook.id },
          { contentType: "json" },
        );
      }
      await c.env.DB.prepare(
        "UPDATE deliveries SET state = 'queued' WHERE submission_id = ? AND state = 'accepted'",
      )
        .bind(submissionId)
        .run();
      if (wantsJson(c)) return c.json({ ok: true, submissionId, ...redirect }, 201);
    }
    // Honeypot hits get a response indistinguishable from a real one.
    if (wantsJson(c)) return c.json({ ok: true, submissionId: ulid(deps.now()), ...redirect }, 201);
    if (after?.type === "redirect") return c.html(renderRedirect(form, after.url, c.var.page));
    const success =
      after?.type === "message" ? after.message : "Thanks — your response was received.";
    return c.html(renderMessage(form.title, success, c.var.page, form));
  });

  return pub;
}
