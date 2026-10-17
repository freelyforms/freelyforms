import { Hono, type Context } from "hono";
import type { Env } from "../env.js";
import { formPageCsp } from "../public/protect.js";
import { renderForm } from "../public/render.js";
import { randomToken } from "../util.js";
import { siteCsp, sitePage, type SiteContext } from "./layout.js";
import { legalPage, privacyBody, termsBody } from "./legal.js";
import {
  embed,
  googleSheets,
  home,
  howItWorks,
  notFound,
  security,
  templatePage,
  templatesHub,
  whyFree,
  type Page,
} from "./pages.js";
import { templateBySlug, TEMPLATES } from "./templates.js";

type Ctx = Context<{ Bindings: Env }>;

const PAGES: Page[] = [home, howItWorks, whyFree, security, googleSheets, embed, templatesHub];

function context(c: Ctx): SiteContext {
  return {
    origin: c.env.APP_ORIGIN ?? new URL(c.req.url).origin,
    indexable: c.env.SITE_INDEXABLE === "1",
    nonce: randomToken(16),
  };
}

function send(c: Ctx, page: Page, status: 200 | 404 = 200) {
  const ctx = context(c);
  c.header("Content-Security-Policy", siteCsp(ctx.nonce));
  c.header("Cache-Control", "public, max-age=300");
  if (!ctx.indexable) c.header("X-Robots-Tag", "noindex");
  return c.html(sitePage(ctx, page.meta, page.body), status);
}

/** The public website on the app domain (not on the forms domain). */
export function siteRoutes(): Hono<{ Bindings: Env }> {
  const site = new Hono<{ Bindings: Env }>();

  for (const page of PAGES) {
    site.get(page.meta.path, (c) => send(c, page));
    // Canonical URLs end with a slash; the bare path redirects.
    if (page.meta.path !== "/") {
      site.get(page.meta.path.slice(0, -1), (c) => c.redirect(page.meta.path, 301));
    }
  }

  site.get("/templates/:slug/", (c) => {
    const t = templateBySlug(c.req.param("slug"));
    return t ? send(c, templatePage(t)) : send(c, notFound, 404);
  });
  site.get("/templates/:slug", (c) =>
    templateBySlug(c.req.param("slug"))
      ? c.redirect(`/templates/${c.req.param("slug")}/`, 301)
      : send(c, notFound, 404),
  );

  /** The template rendered by the real form renderer, framed by the template page. */
  site.get("/templates/:slug/preview", (c) => {
    const t = templateBySlug(c.req.param("slug"));
    if (!t) return c.notFound();
    const nonce = randomToken(16);
    c.header(
      "Content-Security-Policy",
      formPageCsp(nonce, false).replace("frame-ancestors *", "frame-ancestors 'self'"),
    );
    c.header("X-Robots-Tag", "noindex");
    c.header("Cache-Control", "public, max-age=300");
    return c.html(renderForm(t.form, "", { nonce, preview: true }));
  });

  for (const [path, title, body] of [
    ["/privacy", "Privacy policy", privacyBody],
    ["/terms", "Terms of use", termsBody],
  ] as const) {
    site.get(path, (c) => {
      const ctx = context(c);
      c.header("Content-Security-Policy", siteCsp(ctx.nonce));
      return c.html(legalPage(ctx, path, title, body));
    });
  }

  // Brand files ship with the builder's static assets; robots.txt allows /app/brand/ so search
  // engines can fetch the favicon.
  site.get("/favicon.ico", (c) => c.redirect("/app/brand/favicon.svg", 301));

  site.get("/robots.txt", (c) => {
    const ctx = context(c);
    const body = ctx.indexable
      ? `User-agent: *\nAllow: /\nAllow: /app/brand/\nDisallow: /app/\nDisallow: /auth/\nDisallow: /forms/\nDisallow: /account/\n\nSitemap: ${ctx.origin}/sitemap.xml\n`
      : "User-agent: *\nAllow: /\n";
    return c.text(body);
  });

  site.get("/sitemap.xml", (c) => {
    const ctx = context(c);
    const paths = [
      ...PAGES.map((p) => p.meta.path),
      ...TEMPLATES.map((t) => `/templates/${t.slug}/`),
      "/privacy",
      "/terms",
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
      .map((p) => `  <url><loc>${ctx.origin}${p}</loc></url>`)
      .join("\n")}\n</urlset>\n`;
    c.header("Content-Type", "application/xml; charset=utf-8");
    return c.body(xml);
  });

  return site;
}
