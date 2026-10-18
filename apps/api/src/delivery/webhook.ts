/**
 * Webhook destination (ADR 0021): one per form, next to the sheet. The consumer POSTs each
 * submission as signed JSON; only delivery metadata is kept, never the body.
 */
import { decryptText, encrypt, type Envelope } from "@freelyforms/crypto";
import type { AnswerValue } from "@freelyforms/form-engine";
import { answerFields, parseForm, type Field, type Form } from "@freelyforms/form-schema";
import { combinedText, driveFileUrl } from "@freelyforms/google";
import type { DeliveryMessage, Deps, Env } from "../env.js";
import { keyringFor } from "../keys.js";
import { base64Url, randomToken } from "../util.js";

export const SIGNATURE_HEADER = "Freely-Signature";
const TIMEOUT_MS = 10_000;
const MAX_URL_LENGTH = 2_000;

/** Why a URL can't be a webhook, or null. HTTPS only, and not an address on a private network. */
export function webhookUrlProblem(value: string): string | null {
  if (value.length > MAX_URL_LENGTH) return "too_long";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "invalid_url";
  }
  if (url.protocol !== "https:") return "https_required";
  if (url.username || url.password) return "credentials_not_allowed";
  const host = url.hostname.toLowerCase();
  // IP literals and local names would point the service at networks it should never call.
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.startsWith("[") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    !host.includes(".")
  ) {
    return "host_not_allowed";
  }
  return null;
}

/** A new signing secret and its encrypted form for storage. */
export async function newSecret(env: Env, webhookId: string) {
  const secret = randomToken(32);
  const stored = JSON.stringify(
    await encrypt(await keyringFor(env), secret, `webhook:${webhookId}`),
  );
  return { secret, stored };
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
  return [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`. */
export async function signature(secret: string, body: string, nowMs: number): Promise<string> {
  const t = String(Math.floor(nowMs / 1000));
  return `t=${t},v1=${await hmacHex(secret, `${t}.${body}`)}`;
}

/** What the sheet would show for an answer: option labels for choices, the value otherwise. */
/** File answers carry `<fileId>:<token>`; receivers get the file ID only (ADR 0007). */
const fileIds = (value: AnswerValue | undefined) =>
  Array.isArray(value) ? (value as readonly string[]).map((v) => v.split(":")[0] ?? "") : [];

function textOf(field: Field, value: AnswerValue | undefined): string {
  if (value === undefined) return "";
  if (field.type === "file" || field.type === "signature") {
    return fileIds(value).map(driveFileUrl).join("\n");
  }
  const combined = combinedText(field, value);
  if (combined !== null) return combined;
  if ("options" in field) {
    const ids = Array.isArray(value) ? value : [value];
    return ids.map((id) => field.options.find((o) => o.id === id)?.label ?? String(id)).join(", ");
  }
  return typeof value === "boolean" ? (value ? "Yes" : "") : String(value);
}

export function webhookBody(
  form: Form,
  message: Pick<DeliveryMessage, "submissionId" | "formId" | "formVersion" | "submittedAt">,
  values: Readonly<Record<string, AnswerValue>>,
  test = false,
): string {
  const fields = answerFields(form);
  return JSON.stringify({
    event: "submission.created",
    ...(test ? { test: true } : {}),
    formId: message.formId,
    formVersion: message.formVersion,
    submissionId: message.submissionId,
    submittedAt: new Date(message.submittedAt).toISOString(),
    answers: Object.fromEntries(
      fields
        .filter((f) => values[f.id] !== undefined)
        .map((f) => [
          f.id,
          f.type === "file" || f.type === "signature" ? fileIds(values[f.id]) : values[f.id],
        ]),
    ),
    fields: fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      value:
        f.type === "file" || f.type === "signature"
          ? fileIds(values[f.id])
          : (values[f.id] ?? null),
      text: textOf(f, values[f.id]),
    })),
  });
}

interface WebhookRow {
  id: string;
  url: string;
  secret: string;
}

/** POSTs a signed body; returns the HTTP status (0 for a network error or timeout). */
export async function post(
  deps: Deps,
  hook: { url: string; secret: string },
  body: string,
  submissionId: string,
): Promise<number> {
  try {
    const res = await deps.fetch(hook.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "user-agent": "FreelyForms-Webhook/1",
        "freely-submission-id": submissionId,
        [SIGNATURE_HEADER.toLowerCase()]: await signature(hook.secret, body, deps.now()),
      },
      body,
    });
    await res.body?.cancel();
    return res.status;
  } catch {
    return 0;
  }
}

/** 408, 429, 5xx and network errors are worth another try; other answers are final. */
export const retryableStatus = (status: number) =>
  status === 0 || status === 408 || status === 429 || status >= 500;

async function record(env: Env, id: string, status: number, now: number) {
  const ok = status >= 200 && status < 300;
  await env.DB.prepare(
    `UPDATE webhooks SET last_status = ?, last_attempt_at = ?, failing = ?,
       last_ok_at = CASE WHEN ? THEN ? ELSE last_ok_at END, updated_at = ? WHERE id = ?`,
  )
    .bind(status, now, ok ? 0 : 1, ok ? 1 : 0, now, now, id)
    .run();
}

/**
 * Delivers one webhook message. Retries with the delivery backoff while the queue keeps the
 * message (`retry` decides the delay); a webhook removed since the submission is skipped.
 */
export async function deliverWebhook(
  env: Env,
  deps: Deps,
  message: Message<DeliveryMessage>,
  retry: (attempts: number) => number | null,
): Promise<void> {
  const m = message.body;
  const hook = await env.DB.prepare(
    "SELECT id, url, secret FROM webhooks WHERE id = ? AND form_id = ?",
  )
    .bind(m.webhookId ?? "", m.formId)
    .first<WebhookRow>();
  const version = await env.DB.prepare(
    "SELECT schema_json FROM form_versions WHERE form_id = ? AND version = ?",
  )
    .bind(m.formId, m.formVersion)
    .first<{ schema_json: string }>();
  const parsed = version && parseForm(JSON.parse(version.schema_json));
  if (!hook || !parsed?.success) {
    message.ack();
    return;
  }
  const keyring = await keyringFor(env);
  const secret = await decryptText(
    keyring,
    JSON.parse(hook.secret) as Envelope,
    `webhook:${hook.id}`,
  );
  const { values } = JSON.parse(
    await decryptText(keyring, m.payload, `submission:${m.submissionId}`),
  ) as { values: Record<string, AnswerValue> };
  const status = await post(
    deps,
    { url: hook.url, secret },
    webhookBody(parsed.form, m, values),
    m.submissionId,
  );
  await record(env, hook.id, status, deps.now());
  const delay =
    status >= 200 && status < 300 ? null : retryableStatus(status) ? retry(message.attempts) : null;
  if (delay === null) message.ack();
  else message.retry({ delaySeconds: delay });
}

/** A sample body for "Send a test event", with plausible values for each field. */
export function sampleValues(form: Form): Record<string, AnswerValue> {
  const values: Record<string, AnswerValue> = {};
  for (const f of answerFields(form)) {
    if ("options" in f) {
      const first = f.options[0]?.id;
      if (first)
        values[f.id] = f.type === "checkboxes" || f.type === "multiselect" ? [first] : first;
    } else if (f.type === "number" || f.type === "rating" || f.type === "scale") values[f.id] = 3;
    else if (f.type === "consent") values[f.id] = true;
    else if (f.type === "date") values[f.id] = "2026-01-31";
    else if (f.type === "email") values[f.id] = "someone@example.com";
    else values[f.id] = `Sample ${f.label}`;
  }
  return values;
}

export const newWebhookId = () => `whk_${base64Url(crypto.getRandomValues(new Uint8Array(12)))}`;
