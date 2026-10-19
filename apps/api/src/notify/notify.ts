/**
 * Owner notifications (ADR 0026): an email when responses reach the owner's sheet, with the form
 * title, how many arrived and links, never the answers. At most one email per form every
 * THROTTLE_MS; responses that arrive in between are counted in the next one (the hourly cron
 * sends it if no further response does).
 */
import { html } from "hono/html";
import type { Deps, Env } from "../env.js";
import { spreadsheetUrl } from "../google-access.js";
import { base64Url, safeEqual } from "../util.js";

export const THROTTLE_MS = 15 * 60 * 1000;
/** Forms looked at per hourly sweep. */
const SWEEP_LIMIT = 50;

export const notificationsAvailable = (env: Env) =>
  Boolean(env.EMAIL && env.NOTIFY_FROM && env.APP_ORIGIN);

/** HMAC of the form ID with a key derived from the master key: the unsubscribe link's proof. */
export async function unsubscribeToken(env: Env, formId: string): Promise<string> {
  const ikm = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.MASTER_KEY_K1),
    "HKDF",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode("notify-unsubscribe"),
    },
    ikm,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(formId));
  return base64Url(new Uint8Array(mac)).slice(0, 32);
}

export async function validUnsubscribe(env: Env, formId: string, token: string) {
  return safeEqual(await unsubscribeToken(env, formId), token);
}

interface Pending {
  form_id: string;
  title: string;
  email: string;
  since: number;
  last_sent_at: number | null;
  spreadsheet_id: string | null;
  sheet_id: number | null;
}

export async function notificationEmail(
  env: Env,
  p: {
    formId: string;
    title: string;
    count: number;
    sheetUrl: string | null;
    unsubscribeUrl: string;
  },
) {
  const app = env.APP_ORIGIN ?? "";
  const formUrl = `${app}/app/forms/${p.formId}`;
  const what = p.count === 1 ? "a new response" : `${String(p.count)} new responses`;
  const subject = `${p.count === 1 ? "New response" : `${String(p.count)} new responses`}: ${p.title.replace(/\s+/g, " ")}`;
  const text = [
    `Your form "${p.title}" received ${what}.`,
    "",
    ...(p.sheetUrl ? [`Open the sheet: ${p.sheetUrl}`] : []),
    `Open the form in Freely Forms: ${formUrl}`,
    "",
    "You get this email because you turned on notifications for this form.",
    `Turn them off: ${p.unsubscribeUrl}`,
  ].join("\n");
  const body = html`<!doctype html>
    <html lang="en">
      <body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1b1b1f">
        <p>Your form <strong>${p.title}</strong> received ${what}.</p>
        <p>
          ${p.sheetUrl ? html`<a href="${p.sheetUrl}">Open the sheet</a> · ` : ""}<a
            href="${formUrl}"
            >Open the form in Freely Forms</a
          >
        </p>
        <p style="color:#5d5d66;font-size:13px">
          You get this email because you turned on notifications for this form.
          <a href="${p.unsubscribeUrl}">Turn them off</a>.
        </p>
      </body>
    </html>`;
  return { subject, text, html: String(await body) };
}

/**
 * Sends the emails that are due for these forms: notifications on, not sent within THROTTLE_MS,
 * and at least one response delivered since the last one. Never throws: delivery must not depend
 * on email.
 */
export async function notifyForms(env: Env, deps: Deps, formIds: string[]): Promise<number> {
  if (!notificationsAvailable(env) || formIds.length === 0) return 0;
  const now = deps.now();
  let sent = 0;
  try {
    const { results } = await env.DB.prepare(
      `SELECT n.form_id, f.title, u.email, COALESCE(n.last_sent_at, n.created_at) AS since,
              n.last_sent_at, d.spreadsheet_id, d.sheet_id
       FROM form_notifications n
       JOIN forms f ON f.id = n.form_id AND f.status = 'published'
       JOIN users u ON u.id = f.owner_id
       LEFT JOIN destinations d ON d.form_id = n.form_id
       WHERE n.form_id IN (SELECT value FROM json_each(?))
         AND (n.last_sent_at IS NULL OR n.last_sent_at <= ?)`,
    )
      .bind(JSON.stringify(formIds), now - THROTTLE_MS)
      .all<Pending>();
    for (const p of results) {
      const count = await env.DB.prepare(
        "SELECT count(*) AS n FROM deliveries WHERE form_id = ? AND state = 'delivered' AND delivered_at > ?",
      )
        .bind(p.form_id, p.since)
        .first<number>("n");
      if (!count) continue;
      const token = await unsubscribeToken(env, p.form_id);
      const message = await notificationEmail(env, {
        formId: p.form_id,
        title: p.title,
        count,
        sheetUrl:
          p.spreadsheet_id === null ? null : spreadsheetUrl(p.spreadsheet_id, p.sheet_id ?? 0),
        unsubscribeUrl: `${env.APP_ORIGIN ?? ""}/notifications/off?form=${p.form_id}&token=${token}`,
      });
      // Mark first: a crash after sending must not send the same email again and again.
      await env.DB.prepare("UPDATE form_notifications SET last_sent_at = ? WHERE form_id = ?")
        .bind(now, p.form_id)
        .run();
      try {
        await env.EMAIL?.send({ to: p.email, from: env.NOTIFY_FROM ?? "", ...message });
        sent++;
      } catch (err) {
        console.error("notification_not_sent", err instanceof Error ? err.name : "unknown");
      }
    }
  } catch (err) {
    console.error("notifications_failed", err instanceof Error ? err.name : "unknown");
  }
  return sent;
}

/** Hourly: emails held back by the throttle whose window has passed. */
export async function sweepNotifications(env: Env, deps: Deps): Promise<number> {
  if (!notificationsAvailable(env)) return 0;
  const { results } = await env.DB.prepare(
    `SELECT n.form_id FROM form_notifications n
     WHERE (n.last_sent_at IS NULL OR n.last_sent_at <= ?)
       AND EXISTS (SELECT 1 FROM deliveries x WHERE x.form_id = n.form_id AND x.state = 'delivered'
                   AND x.delivered_at > COALESCE(n.last_sent_at, n.created_at))
     LIMIT ?`,
  )
    .bind(deps.now() - THROTTLE_MS, SWEEP_LIMIT)
    .all<{ form_id: string }>();
  return notifyForms(
    env,
    deps,
    results.map((r) => r.form_id),
  );
}
