import { describe, expect, it } from "vitest";
import { createApp, type Env } from "../src/app.js";
import { TEMPLATE_GROUPS } from "../src/site/pages.js";
import { TEMPLATES } from "../src/site/templates.js";

const app = createApp({ fetch: () => Promise.reject(new Error("no network")), now: () => 0 });
const env = { APP_ORIGIN: "https://site.test" } as unknown as Env;
const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");
const get = (path: string, e: Env = env) => app.request(`https://site.test${path}`, {}, e);

describe("website", () => {
  it("serves pages noindex until indexing is switched on, with canonical URLs", async () => {
    for (const path of [
      "/how-it-works/",
      "/why-free/",
      "/open-source/",
      "/integrations/google-sheets/",
      "/features/embed/",
      "/templates/",
      "/templates/contact-form/",
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("x-robots-tag"), path).toBe("noindex");
      const page = await res.text();
      expect(page).toContain(`<link rel="canonical" href="https://site.test${path}"`);
      expect(page).toContain('name="robots" content="noindex"');
      // Only pages with form previews carry the script that sizes them, under the page's nonce.
      const previews = path === "/" || path === "/templates/contact-form/";
      expect(page.includes("<script nonce="), path).toBe(previews);
      // Apart from it, only JSON-LD data blocks, which never run.
      const other = page
        .replace(/<script nonce="[^"]+">[^<]*<\/script>/, "")
        .replace(/<script type="application\/ld\+json">[^<]*<\/script>/g, "");
      expect(other).not.toContain("<script");
    }
    const open = await get("/how-it-works/", { ...env, SITE_INDEXABLE: "1" });
    expect(open.headers.get("x-robots-tag")).toBeNull();
    expect(await open.text()).not.toContain("noindex");
  });

  it("links the organization, site and app on the homepage, and gives templates breadcrumbs", async () => {
    const jsonLd = async (path: string) => {
      const page = await (await get(path)).text();
      const match = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(page);
      return JSON.parse(match?.[1] ?? "{}") as Record<string, unknown>;
    };
    const graph = (await jsonLd("/"))["@graph"] as Record<string, unknown>[];
    const byType: Record<string, Record<string, unknown> | undefined> = Object.fromEntries(
      graph.map((n) => [String(n["@type"]), n]),
    );
    expect(byType.WebApplication?.["@id"]).toBe("https://site.test/#software");
    expect(byType.WebApplication?.author).toEqual({
      "@id": "https://grigoryfrolov.com/about/#person",
    });
    expect(byType.WebApplication?.publisher).toEqual({ "@id": byType.Organization?.["@id"] });
    expect(byType.Person?.["@id"]).toBe("https://grigoryfrolov.com/about/#person");
    expect(byType.WebSite?.publisher).toEqual({ "@id": "https://site.test/#organization" });

    const crumbs = await jsonLd("/templates/contact-form/");
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(
      (crumbs.itemListElement as { position: number; name: string; item: string }[]).map((c) => [
        c.position,
        c.name,
        c.item,
      ]),
    ).toEqual([
      [1, "Home", "https://site.test/"],
      [2, "Templates", "https://site.test/templates/"],
      [3, "Contact form", "https://site.test/templates/contact-form/"],
    ]);
  });

  it("keeps the homepage, security and legal pages indexable for Google's brand verification", async () => {
    for (const path of ["/", "/security/", "/privacy", "/terms"]) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("x-robots-tag"), path).toBeNull();
      expect(await res.text(), path).not.toContain("noindex");
    }
    expect((await get("/templates/no-such-template/")).headers.get("x-robots-tag")).toBe("noindex");
  });

  it("renders template pages with the sheet columns, field reasons and a copy link", async () => {
    for (const t of TEMPLATES) {
      const page = await (await get(`/templates/${t.slug}/`)).text();
      expect(page).toContain(`href="/app/?template=${t.slug}"`);
      expect(page).toContain("<th>_submission_id</th>");
      for (const f of t.form.fields) expect(page).toContain(`<th>${escape(f.label)}</th>`);
      const preview = await get(`/templates/${t.slug}/preview`);
      expect(preview.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
      expect(await preview.text()).toContain('class="is-preview"');
    }
    const missing = await get("/templates/unknown/");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Page not found");
    expect(await (await get("/robots.txt")).text()).not.toContain("Sitemap");
    expect((await get("/privacy")).status).toBe(200);
  });

  it("lists every template once on the hub, grouped", async () => {
    const grouped = TEMPLATE_GROUPS.flatMap((g) => g.slugs);
    expect([...grouped].sort()).toEqual(TEMPLATES.map((t) => t.slug).sort());
    const hub = await (await get("/templates/")).text();
    for (const t of TEMPLATES) expect(hub).toContain(`href="/templates/${t.slug}/"`);
  });

  it("redirects paths without a trailing slash and lists pages in the sitemap", async () => {
    const res = await get("/how-it-works");
    expect([res.status, res.headers.get("location")]).toEqual([301, "/how-it-works/"]);
    const sitemap = await (await get("/sitemap.xml")).text();
    expect(sitemap).toContain("<loc>https://site.test/templates/contact-form/</loc>");
    expect(sitemap).not.toContain("/app/");
    expect(await (await get("/robots.txt", { ...env, SITE_INDEXABLE: "1" })).text()).toContain(
      "Sitemap: https://site.test/sitemap.xml",
    );
    expect(await (await get("/robots.txt", { ...env, SITE_INDEXABLE: "1" })).text()).toContain(
      "Allow: /app/brand/",
    );
  });

  it("links the public repository from the open-source page", async () => {
    const res = await get("/open-source/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('href="https://github.com/freelyforms/freelyforms"');
  });

  it("points the favicon and social image at the brand assets", async () => {
    const res = await get("/favicon.ico");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/app/brand/favicon.svg");
    const home = await (await get("/")).text();
    expect(home).toContain('rel="icon" href="/app/brand/favicon.svg"');
    expect(home).toContain('og:image" content="https://site.test/app/brand/og.png"');
  });
});
