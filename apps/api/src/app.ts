import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { FORM_SCHEMA_VERSION } from "@freelyforms/form-schema/limits";
import { accountRoutes } from "./account.js";
import { authRoutes } from "./auth/routes.js";
import { formRoutes } from "./forms/routes.js";
import { EMBED_JS } from "./public/embed.js";
import { publicRoutes } from "./public/routes.js";
import { siteRoutes } from "./site/routes.js";
import { domainRoutes } from "./domains/routes.js";
import { notifyRoutes } from "./notify/routes.js";
import { isCustomHost, serveCustomDomain } from "./domains/serve.js";
import { defaultDeps, type Deps, type Env } from "./env.js";

export type { Env } from "./env.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** CSP for the builder: own scripts and styles only; it may frame its own previews. */
function appCsp(env: Env): string {
  return [
    "default-src 'self'",
    // Google Picker (ADR 0006) loads its script from apis.google.com and opens in a docs.google.com frame.
    "script-src 'self' https://apis.google.com",
    // Google Picker injects an inline <style> into the page; scripts stay strictly allow-listed.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.googleusercontent.com https://ssl.gstatic.com",
    "connect-src 'self'",
    `frame-src 'self' https://docs.google.com${env.FORMS_HOST ? ` https://${env.FORMS_HOST}` : ""}`,
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function createApp(deps: Deps = defaultDeps): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // Not `no-referrer` (the Hono default): with it, browsers send `Origin: null` on same-origin
  // form posts, which the origin check below would reject.
  // X-Frame-Options is replaced by CSP frame-ancestors: app pages forbid framing, public forms allow
  // it so owners can embed them.
  app.use(
    secureHeaders({
      referrerPolicy: "strict-origin-when-cross-origin",
      xFrameOptions: false,
      crossOriginResourcePolicy: false,
    }),
  );
  app.use(async (c, next) => {
    await next();
    // Same-origin by default; the embed script opts out so owners' sites can load it.
    if (!c.res.headers.has("Cross-Origin-Resource-Policy")) {
      c.header("Cross-Origin-Resource-Policy", "same-origin");
    }
    if (!c.res.headers.has("Content-Security-Policy")) {
      c.header(
        "Content-Security-Policy",
        "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      );
    }
  });

  // Hosted domains: plain HTTP and the www host go to the canonical HTTPS origin. Local development
  // (no APP_ORIGIN) is untouched.
  app.use(async (c, next) => {
    const url = new URL(c.req.url);
    const canonical = c.env.APP_ORIGIN ? new URL(c.env.APP_ORIGIN) : null;
    if (canonical && url.hostname === `www.${canonical.hostname}`) {
      return c.redirect(`${canonical.origin}${url.pathname}${url.search}`, 301);
    }
    if (canonical && url.protocol === "http:") {
      url.protocol = "https:";
      return c.redirect(url.toString(), 308); // 308 keeps the method of a form POST
    }
    await next();
  });

  // ADR 0025: owners' custom domains reach this Worker through Cloudflare for SaaS and only ever
  // show forms. Other names under the forms domain (such as the CNAME target) serve nothing.
  app.use(async (c, next) => {
    const host = new URL(c.req.url).hostname;
    if (c.env.FORMS_HOST && host.endsWith(`.${c.env.FORMS_HOST}`)) return c.text("Not found", 404);
    if (isCustomHost(c.env, host)) return serveCustomDomain(c);
    await next();
  });

  // ADR 0010: on the forms domain every path is a public form (`/<formId>` → `/f/<formId>`), and
  // nothing else from this app is reachable there.
  app.use(async (c, next) => {
    const host = new URL(c.req.url).hostname;
    // Forms never render on the app domain once a forms domain is configured: a redirect keeps
    // old links working without putting form content next to the session cookie.
    if (c.env.FORMS_HOST && host !== c.env.FORMS_HOST && c.req.path.startsWith("/f/")) {
      const formId = c.req.path.slice(3);
      if (!/^(frm_[A-Za-z0-9]{6,32}(\/uploads)?|embed\.js)$/.test(formId))
        return c.text("Not found", 404);
      return c.redirect(`https://${c.env.FORMS_HOST}/${formId}`, 308);
    }
    if (c.env.FORMS_HOST && host === c.env.FORMS_HOST && !c.req.path.startsWith("/f/")) {
      const url = new URL(c.req.url);
      // The bare forms domain points people to the website.
      if (url.pathname === "/" && c.env.APP_ORIGIN) return c.redirect(c.env.APP_ORIGIN, 302);
      // A form, its upload slots (ADR 0007) or the embed script.
      if (!/^\/(frm_[A-Za-z0-9]{6,32}(\/uploads)?|embed\.js)$/.test(url.pathname))
        return c.text("Not found", 404);
      url.pathname = `/f${url.pathname}`;
      // No waitUntil is needed on this path, so the execution context is not forwarded.
      return app.fetch(new Request(url, c.req.raw), c.env);
    }
    await next();
  });

  // CSRF baseline: state-changing requests must come from our own origin. Public form
  // submissions are cross-origin by design (embeds) and rely on no cookies.
  app.use(async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method) && !c.req.path.startsWith("/f/")) {
      const origin = c.req.header("origin");
      if (origin !== new URL(c.req.url).origin) return c.json({ error: "forbidden_origin" }, 403);
    }
    await next();
  });

  app.get("/health", async (c) => {
    const row = await c.env.DB.prepare(
      "SELECT count(*) AS tables FROM sqlite_schema WHERE type = 'table'",
    ).first<{ tables: number }>();
    return c.json({ ok: true, schemaVersion: FORM_SCHEMA_VERSION, db: row ? "ok" : "unavailable" });
  });

  app.route("/auth", authRoutes(deps));
  app.route("/", siteRoutes());
  app.route("/account", accountRoutes(deps));
  app.route("/domain", domainRoutes(deps));
  app.route("/notifications", notifyRoutes());
  app.route("/forms", formRoutes(deps));
  app.get("/f/embed.js", (c) => {
    c.header("Content-Type", "text/javascript; charset=utf-8");
    // Loaded by owners' sites, so it must be readable cross-origin (secureHeaders defaults to same-origin).
    c.header("Cross-Origin-Resource-Policy", "cross-origin");
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(EMBED_JS);
  });
  app.route("/f", publicRoutes(deps));

  // The builder (apps/web) is a static app under /app/, served from the same origin as the API so
  // the session cookie and the Origin check work without CORS. "/" is the website (ADR 0015).
  app.get("/app", (c) => c.redirect("/app/", 301));
  app.get("/app/*", async (c) => {
    if (!c.env.ASSETS)
      return c.text("The web app is not built. Run: pnpm --filter @freelyforms/web build", 503);
    // Assets are uploaded from apps/web/dist/app, so /app/x is the asset /x.
    const asset = (path: string) => {
      const url = new URL(c.req.url);
      url.pathname = path;
      return (
        c.env.ASSETS?.fetch(new Request(url, c.req.raw)) ?? Promise.reject(new Error("no assets"))
      );
    };
    let res = await asset(c.req.path.slice("/app".length) || "/");
    // Client-side routes (no file extension) all load the app shell.
    if (res.status === 404 && !/\.[a-z0-9]+$/i.test(c.req.path)) res = await asset("/");
    const out = new Response(res.body, res);
    if (out.headers.get("content-type")?.includes("text/html")) {
      out.headers.set("Content-Security-Policy", appCsp(c.env));
      out.headers.set("Cache-Control", "no-cache");
    }
    return out;
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.onError((err, c) => {
    // Log the error type only: messages and stacks may contain request data.
    console.error("unhandled_error", err.name);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

export const app = createApp();
