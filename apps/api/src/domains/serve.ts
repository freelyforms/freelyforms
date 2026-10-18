/**
 * Requests on an owner's custom domain (ADR 0025). The page there is a thin shell that embeds the
 * form from the forms domain, so the challenge, uploads and everything else keep running on one
 * origin. Nothing else of this service is reachable on a custom domain.
 */
import { parseForm, type FormTheme } from "@freelyforms/form-schema";
import type { Context } from "hono";
import { html, raw } from "hono/html";
import type { Env } from "../env.js";
import { embedSnippet } from "../public/embed.js";
import { randomToken } from "../util.js";
import { isOwnHost } from "./routes.js";

const FORM_ID = /^frm_[A-Za-z0-9]{6,32}$/;
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** True when this request should be answered as a custom domain. */
export const isCustomHost = (env: Env, host: string) =>
  Boolean(env.CUSTOM_DOMAIN_TARGET && env.FORMS_HOST && env.APP_ORIGIN) && !isOwnHost(env, host);

// The iframe's inline style attribute is blocked by this page's CSP; these rules replace it.
const STYLE =
  "body{margin:0;background:var(--bg);font:16px/1.5 system-ui,sans-serif}iframe{display:block;border:0;width:100%;height:600px}main{max-width:40rem;margin:15vh auto;padding:0 16px}";

const background = (theme: FormTheme | undefined) => {
  const scheme = theme?.colorScheme ?? "auto";
  return scheme === "auto"
    ? ":root{color-scheme:light dark;--bg:#fff}@media (prefers-color-scheme:dark){:root{--bg:#141417}}"
    : `:root{color-scheme:${scheme};--bg:${scheme === "dark" ? "#141417" : "#fff"}}`;
};

function shell(
  c: Context<{ Bindings: Env }>,
  title: string,
  body: string,
  css: string,
  status: 200 | 404,
) {
  const nonce = randomToken(16);
  const forms = `https://${c.env.FORMS_HOST ?? ""}`;
  c.header(
    "Content-Security-Policy",
    `default-src 'none'; script-src ${forms}; frame-src ${forms}; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  );
  c.header("X-Robots-Tag", "noindex");
  c.header("Cache-Control", "no-store");
  return c.html(
    html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="robots" content="noindex" />
          <title>${title}</title>
          <style nonce="${nonce}">
            ${raw(css)}
            ${raw(STYLE)}
          </style>
        </head>
        <body>
          ${raw(body)}
        </body>
      </html>`,
    status,
  );
}

const notFound = (c: Context<{ Bindings: Env }>) =>
  shell(
    c,
    "Form not found",
    "<main><h1>Form not found</h1><p>There is no form at this address.</p></main>",
    background(undefined),
    404,
  );

export async function serveCustomDomain(c: Context<{ Bindings: Env }>): Promise<Response> {
  const url = new URL(c.req.url);
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return c.text("Method not allowed", 405);
  if (url.pathname === "/robots.txt") return c.text("User-agent: *\nDisallow: /\n");
  const domain = await c.env.DB.prepare("SELECT owner_id FROM custom_domains WHERE hostname = ?")
    .bind(url.hostname)
    .first<{ owner_id: string }>();
  const path = url.pathname.slice(1).replace(/\/$/, "");
  if (!domain || !(FORM_ID.test(path) || SLUG.test(path))) return notFound(c);

  const row = await c.env.DB.prepare(
    `SELECT f.id, f.title, v.schema_json FROM forms f
     JOIN form_versions v ON v.form_id = f.id AND v.version = f.published_version
     WHERE f.owner_id = ? AND f.status = 'published' AND (f.id = ? OR f.slug = ?)`,
  )
    .bind(domain.owner_id, path, path)
    .first<{ id: string; title: string; schema_json: string }>();
  if (!row) return notFound(c);
  const parsed = parseForm(JSON.parse(row.schema_json));
  const theme = parsed.success ? parsed.form.settings?.theme : undefined;
  const forms = `https://${c.env.FORMS_HOST ?? ""}`;
  // The query string carries prefilled answers (the form reads them from its own address).
  const embed = embedSnippet(
    `${forms}/${row.id}${url.search}`,
    row.title,
    `${forms}/embed.js`,
  ).replace(' loading="lazy"', "");
  return shell(c, row.title, embed, background(theme), 200);
}
