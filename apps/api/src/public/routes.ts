import { encrypt } from "@freelyforms/crypto";
import { validateSubmission } from "@freelyforms/form-engine";
import { parseForm, type Form } from "@freelyforms/form-schema";
import { PAYLOAD_RETENTION_MS } from "@freelyforms/db";
import { Hono, type Context } from "hono";
import type { DeliveryMessage, Deps, Env } from "../env.js";
import { keyringFor } from "../keys.js";
import { ulid } from "../util.js";
import { renderForm, renderMessage } from "./render.js";

/** Cloudflare Queues rejects messages over 128 KB; keep a margin for metadata and encryption. */
const MAX_BODY_BYTES = 64 * 1024;

type Ctx = Context<{ Bindings: Env }>;

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

/** Reads urlencoded, multipart or JSON bodies into `{ name: value | value[] }`. */
async function readAnswers(c: Ctx): Promise<Record<string, unknown> | null> {
  const type = c.req.header("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await c.req.json<unknown>().catch(() => null);
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  }
  const form = await c.req.parseBody({ all: true }).catch(() => null);
  if (!form) return null;
  const answers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(form)) {
    // Files are not accepted yet (ADR 0007 is still a proposal).
    if (value instanceof File || (Array.isArray(value) && value.some((v) => v instanceof File)))
      return null;
    answers[key] = value;
  }
  return answers;
}

const wantsJson = (c: Ctx) => (c.req.header("accept") ?? "").includes("application/json");

export function publicRoutes(deps: Deps): Hono<{ Bindings: Env }> {
  const pub = new Hono<{ Bindings: Env }>();

  pub.use(async (c, next) => {
    await next();
    c.header("X-Robots-Tag", "noindex");
    c.header("Cache-Control", "no-store");
  });

  pub.get("/:formId", async (c) => {
    const found = await published(c, c.req.param("formId"));
    if (!found)
      return c.html(
        renderMessage("Form not found", "This form does not exist or is not accepting responses."),
        404,
      );
    return c.html(renderForm(found.form, c.req.path));
  });

  pub.post("/:formId", async (c) => {
    const found = await published(c, c.req.param("formId"));
    if (!found) return c.json({ error: "not_found" }, 404);
    const length = Number(c.req.header("content-length") ?? "0");
    if (length > MAX_BODY_BYTES) return c.json({ error: "too_large" }, 413);
    const answers = await readAnswers(c);
    if (!answers) return c.json({ error: "invalid_body" }, 400);

    const { form, version } = found;
    // Honeypot: bots fill every field. Pretend success so they learn nothing.
    const bot = typeof answers._hp === "string" && answers._hp !== "";
    const result = validateSubmission(form, answers);
    if (!result.ok && !bot) {
      if (wantsJson(c)) return c.json({ error: "invalid", errors: result.errors }, 422);
      return c.html(renderForm(form, c.req.path, { values: answers, errors: result.errors }), 422);
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
      await c.env.DB.prepare(
        "UPDATE deliveries SET state = 'queued' WHERE submission_id = ? AND state = 'accepted'",
      )
        .bind(submissionId)
        .run();
      if (wantsJson(c)) return c.json({ ok: true, submissionId }, 201);
    }
    if (wantsJson(c)) return c.json({ ok: true }, 201);
    const success = form.settings?.success?.message ?? "Thanks — your response was received.";
    return c.html(renderMessage(form.title, success));
  });

  return pub;
}
