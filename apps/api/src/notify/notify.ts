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

/** Inline text style; email clients drop <style> blocks and web fonts. */
const font = (size: number, line: number, color = "#1b1b1f", weight = "normal") =>
  `font-family:Arial,Helvetica,sans-serif;font-size:${String(size)}px;line-height:${String(line)}px;font-weight:${weight};color:${color};mso-line-height-rule:exactly`;

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
  const title = p.title.replace(/\s+/g, " ");
  const heading = p.count === 1 ? "New response" : `${String(p.count)} new responses`;
  const primary = p.sheetUrl
    ? { href: p.sheetUrl, label: "Open the sheet" }
    : { href: formUrl, label: "Open the form" };
  // Email clients ignore <style> and most layout CSS: tables, inline styles and an Outlook-only
  // fixed-width wrapper (Word-based Outlook ignores max-width).
  const body = html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <title>${subject}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f6f6f8">
        <div
          aria-hidden="true"
          style="display:none;font-size:1px;line-height:1px;color:#f6f6f8;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all"
        >
          ${title} received ${what}.${p.sheetUrl ? " The answers are in your Google Sheet." : ""}
        </div>
        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          bgcolor="#f6f6f8"
          style="width:100%;background-color:#f6f6f8"
        >
          <tr>
            <td align="center" style="padding:24px 16px">
              <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="width:100%;max-width:560px"
              >
                <tr>
                  <td style="padding:0 4px 16px">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="24" valign="middle" style="width:24px">
                          <img
                            src="${app}/app/brand/apple-touch-icon.png"
                            width="24"
                            height="24"
                            alt=""
                            style="display:block;width:24px;height:24px;border:0;outline:none"
                          />
                        </td>
                        <td width="8" style="width:8px;font-size:0;line-height:0">&nbsp;</td>
                        <td valign="middle" style="${font(16, 24, "#1b1b1f", "bold")}">
                          Freely Forms
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td
                    bgcolor="#ffffff"
                    style="background-color:#ffffff;border:1px solid #dcdce3;border-radius:12px;padding:24px"
                  >
                    <h1 style="margin:0 0 12px;${font(22, 30, "#1b1b1f", "bold")}">${heading}</h1>
                    <p style="margin:0 0 24px;${font(16, 24)}">
                      Your form <strong>${title}</strong> received
                      ${what}.${p.sheetUrl ? " The answers are in your Google Sheet." : ""}
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td
                          align="center"
                          bgcolor="#1f5fd6"
                          style="background-color:#1f5fd6;border-radius:8px;padding:12px 20px"
                        >
                          <a
                            href="${primary.href}"
                            style="display:inline-block;${font(15, 20, "#ffffff", "bold")};text-decoration:none"
                            >${primary.label}</a
                          >
                        </td>
                      </tr>
                    </table>
                    ${
                      p.sheetUrl
                        ? html`<p style="margin:20px 0 0;${font(14, 20, "#5d5d66")}">
                            Or
                            <a href="${formUrl}" style="color:#1f5fd6"
                              >open the form in Freely Forms</a
                            >.
                          </p>`
                        : ""
                    }
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 4px 0;${font(13, 20, "#5d5d66")}">
                    You get this email because you turned on notifications for this form. It never
                    contains the answers.
                    <a href="${p.unsubscribeUrl}" style="color:#5d5d66">Turn them off</a>.
                  </td>
                </tr>
              </table>
              <!--[if mso]></td></tr></table><![endif]-->
            </td>
          </tr>
        </table>
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
