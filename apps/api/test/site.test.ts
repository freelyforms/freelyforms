import { describe, expect, it } from "vitest";
import { createApp, type Env } from "../src/app.js";
import { TEMPLATES } from "../src/site/templates.js";

const app = createApp({ fetch: () => Promise.reject(new Error("no network")), now: () => 0 });
const env = { APP_ORIGIN: "https://site.test" } as unknown as Env;
const get = (path: string, e: Env = env) => app.request(`https://site.test${path}`, {}, e);

describe("website", () => {
  it("serves every page noindex until indexing is switched on, with canonical URLs", async () => {
    for (const path of [
      "/",
      "/how-it-works/",
      "/why-free/",
      "/security/",
      "/integrations/google-sheets/",
      "/features/embed/",
      "/templates/",
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("x-robots-tag"), path).toBe("noindex");
      const page = await res.text();
      expect(page).toContain(`<link rel="canonical" href="https://site.test${path}"`);
      expect(page).toContain('name="robots" content="noindex"');
      expect(page).not.toContain("<script");
    }
    const open = await get("/", { ...env, SITE_INDEXABLE: "1" });
    expect(open.headers.get("x-robots-tag")).toBeNull();
    expect(await open.text()).not.toContain("noindex");
  });

  it("renders template pages with the sheet columns, field reasons and a copy link", async () => {
    for (const t of TEMPLATES) {
      const page = await (await get(`/templates/${t.slug}/`)).text();
      expect(page).toContain(`href="/app/?template=${t.slug}"`);
      expect(page).toContain("<th>_submission_id</th>");
      for (const f of t.form.fields) expect(page).toContain(`<th>${f.label}</th>`);
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

  it("redirects paths without a trailing slash and lists pages in the sitemap", async () => {
    const res = await get("/how-it-works");
    expect([res.status, res.headers.get("location")]).toEqual([301, "/how-it-works/"]);
    const sitemap = await (await get("/sitemap.xml")).text();
    expect(sitemap).toContain("<loc>https://site.test/templates/contact-form/</loc>");
    expect(sitemap).not.toContain("/app/");
    expect(await (await get("/robots.txt", { ...env, SITE_INDEXABLE: "1" })).text()).toContain(
      "Sitemap: https://site.test/sitemap.xml",
    );
  });
});
    expect(await (await get("/robots.txt", { ...env, SITE_INDEXABLE: "1" })).text()).toContain(
      "Allow: /app/brand/",
    );
  });

  it("points the favicon and social image at the brand assets", async () => {
    const res = await get("/favicon.ico");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/app/brand/favicon.svg");
    const home = await (await get("/")).text();
    expect(home).toContain('rel="icon" href="/app/brand/favicon.svg"');
    expect(home).toContain('og:image" content="https://site.test/app/brand/og.png"');
