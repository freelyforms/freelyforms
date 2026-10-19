import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

/**
 * Website layout (server-rendered, no JavaScript except the few lines that size form previews on
 * pages that show them, see FIT_FRAMES). Pages stay `noindex` until the deployment sets
 * SITE_INDEXABLE=1, so the site can be reviewed in production before search engines see it.
 */

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export interface PageMeta {
  /** Full <title>. */
  title: string;
  description: string;
  /** Path of the page, e.g. `/templates/contact-form/`. */
  path: string;
  /** The page shows form previews: add the script that sizes them (FIT_FRAMES). */
  fitFrames?: boolean;
  /** Structured data (schema.org JSON-LD) for this page, built for the site's origin. */
  jsonLd?: (origin: string) => Record<string, unknown>;
}

export interface SiteContext {
  origin: string;
  indexable: boolean;
  nonce: string;
}

const STYLE = `
:root{color-scheme:light dark;--bg:#fff;--bg-2:#f6f6f8;--fg:#1b1b1f;--muted:#5d5d66;--line:#dcdce3;--accent:#1f5fd6;--accent-soft:#e6eefc;--on-accent:#fff;--ok:#1e7b45}
@media (prefers-color-scheme:dark){:root{--bg:#111114;--bg-2:#1a1a1f;--fg:#ececf1;--muted:#a5a5ae;--line:#2c2c34;--accent:#8ab0ff;--accent-soft:#1d2a45;--on-accent:#111114;--ok:#7fd7a0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent)}img{max-width:100%}
.wrap{max-width:1160px;margin:0 auto;padding:0 24px}.narrow>*,.prose>*{max-width:740px}
header.site{border-bottom:1px solid var(--line)}header.site .wrap{display:flex;align-items:center;gap:24px;height:64px}
.logo{font-weight:700;color:var(--fg);text-decoration:none;font-size:1.05rem;display:inline-flex;align-items:center;gap:8px}
nav.main{display:flex;gap:20px;flex:1}nav.main a{color:var(--muted);text-decoration:none;font-size:.95rem}nav.main a:hover,nav.main a[aria-current=page]{color:var(--fg)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border-radius:8px;border:1px solid var(--line);color:var(--fg);text-decoration:none;font-weight:600;white-space:nowrap}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}.btn:hover{filter:brightness(1.05)}
section{padding:64px 0}section+section{border-top:1px solid var(--line)}
h1{font-size:clamp(2.1rem,4.5vw,3.1rem);line-height:1.12;letter-spacing:-.025em;margin:0 0 20px}
h2{font-size:clamp(1.5rem,3vw,2rem);line-height:1.2;letter-spacing:-.01em;margin:0 0 16px}h3{font-size:1.1rem;margin:0 0 8px}
p{margin:0 0 16px}.lead{font-size:1.2rem;color:var(--muted);max-width:60ch}.muted{color:var(--muted)}.small{font-size:.9rem}
.eyebrow{font-size:.85rem;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px}
.actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:28px 0 16px}
.ticks{display:flex;flex-wrap:wrap;gap:8px 20px;padding:0;margin:0;list-style:none;color:var(--muted);font-size:.95rem}.ticks li::before{content:"✓ ";color:var(--ok)}
.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.card{border:1px solid var(--line);border-radius:12px;padding:24px;background:var(--bg)}.card p:last-child{margin:0}
.steps{counter-reset:s;list-style:none;padding:0;display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.steps li{counter-increment:s;border:1px solid var(--line);border-radius:12px;padding:24px}.steps li::before{content:counter(s);display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--accent-soft);color:var(--accent);font-weight:700;margin-bottom:12px}
.demo{display:grid;gap:24px;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);align-items:start}
.frame{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--bg)}.frame-head{display:flex;gap:8px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--bg-2);font-size:.85rem;color:var(--muted)}
.frame iframe{display:block;width:100%;height:640px;border:0}
.sheet{width:100%;border-collapse:collapse;font-size:.85rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.sheet-wrap{overflow-x:auto}
.sheet th,.sheet td{border:1px solid var(--line);padding:6px 10px;text-align:left;white-space:nowrap}.sheet th{background:var(--bg-2);font-weight:600}.sheet td.n{color:var(--muted);background:var(--bg-2);text-align:center}
.flow{display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-weight:600}.flow span{border:1px solid var(--line);border-radius:999px;padding:8px 16px}.flow b{color:var(--muted)}
pre{background:var(--bg-2);border:1px solid var(--line);border-radius:12px;padding:16px;overflow-x:auto;font-size:.85rem}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
.tpl-group{margin-top:48px}.tpl-list{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));list-style:none;padding:0;margin:0 0 20px}
.tpl{display:flex;flex-direction:column;gap:6px;height:100%;border:1px solid var(--line);border-radius:12px;padding:20px;color:var(--fg);text-decoration:none;transition:border-color .15s,background-color .15s}.tpl:hover{border-color:var(--accent);background:var(--bg-2)}.tpl .go{margin-top:auto;padding-top:8px;color:var(--accent);font-size:.9rem;font-weight:600}
.fields{list-style:none;padding:0;margin:0;display:grid;gap:12px}.fields li{border-bottom:1px solid var(--line);padding-bottom:12px}.fields b{display:block}
.tag{font-size:.75rem;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:1px 8px;margin-left:6px;font-weight:500}
.crumbs{font-size:.9rem;color:var(--muted);margin:0 0 16px}.crumbs a{color:inherit}
.prose li{margin:6px 0}.prose h2{margin-top:48px}
footer.site{border-top:1px solid var(--line);padding:48px 0;font-size:.92rem}footer.site .cols{display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
footer.site h4{margin:0 0 10px;font-size:.85rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}footer.site ul{list-style:none;padding:0;margin:0}footer.site li{margin:6px 0}footer.site a{color:var(--fg);text-decoration:none}footer.site a:hover{text-decoration:underline}
.notice{max-width:560px;margin:0 auto}.notice h1{font-size:clamp(1.6rem,3.5vw,2.1rem)}.notice .actions{margin:24px 0 0}button.btn{background:none;font:inherit;font-weight:600;cursor:pointer}button.btn.primary{background:var(--accent)}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}.fine{margin-top:32px}
@media (max-width:860px){nav.main{display:none}.demo{grid-template-columns:1fr}section{padding:48px 0}}
@media (max-width:520px){.wrap{padding:0 16px}section{padding:40px 0}}
@media (prefers-reduced-motion:reduce){.tpl{transition:none}}
`;

/**
 * Form previews report their height (the renderer's embed script); this sizes each preview frame
 * to its form so it never scrolls inside the page. Without it a frame keeps its CSS height.
 */
const FIT_FRAMES = `addEventListener("message",function(e){if(e.origin!==location.origin||!e.data||e.data.type!=="freelyforms:height")return;for(const f of document.querySelectorAll(".frame iframe"))if(f.contentWindow===e.source&&e.data.height>0)f.style.height=Math.ceil(e.data.height)+"px"})`;

const NAV: [string, string][] = [
  ["/templates/", "Templates"],
  ["/how-it-works/", "How it works"],
  ["/integrations/google-sheets/", "Google Sheets"],
  ["/why-free/", "Why free"],
];

const FOOTER: [string, [string, string][]][] = [
  [
    "Product",
    [
      ["/templates/", "Templates"],
      ["/integrations/google-sheets/", "Google Sheets"],
      ["/features/embed/", "Embed a form"],
      ["/how-it-works/", "How it works"],
    ],
  ],
  [
    "Trust",
    [
      ["/security/", "Security"],
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
      ["mailto:hello@freelyforms.com?subject=Abuse%20report", "Report abuse"],
    ],
  ],
  [
    "Learn",
    [
      ["/why-free/", "Why it's free"],
      ["/open-source/", "Open source"],
      ["https://github.com/freelyforms/freelyforms", "GitHub"],
    ],
  ],
  [
    "App",
    [
      ["/app/", "Create a form"],
      ["/app/", "Sign in"],
    ],
  ],
];

/** A BreadcrumbList matching the page's visible trail, which starts at the homepage. */
export const breadcrumbs =
  (trail: [name: string, path: string][]) =>
  (origin: string): Record<string, unknown> => ({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [["Home", "/"] as const, ...trail].map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: `${origin}${path}`,
    })),
  });

export function sitePage(ctx: SiteContext, meta: PageMeta, body: Html): Html {
  const url = `${ctx.origin}${meta.path}`;
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${meta.title}</title>
        <meta name="description" content="${meta.description}" />
        ${ctx.indexable ? "" : raw('<meta name="robots" content="noindex" />')}
        <link rel="canonical" href="${url}" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Freely Forms" />
        <meta property="og:title" content="${meta.title}" />
        <meta property="og:description" content="${meta.description}" />
        <meta property="og:url" content="${url}" />
        <meta property="og:image" content="${ctx.origin}/app/brand/og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        ${
          meta.jsonLd
            ? html`<script type="application/ld+json">
                ${raw(JSON.stringify(meta.jsonLd(ctx.origin)).replace(/</g, "\\u003c"))}
              </script>`
            : ""
        }
        <link rel="icon" href="/app/brand/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/app/brand/apple-touch-icon.png" />
        <style nonce="${ctx.nonce}">
          ${raw(STYLE)}
        </style>
      </head>
      <body>
        <header class="site">
          <div class="wrap">
            <a class="logo" href="/"
              ><img src="/app/brand/logo.svg" alt="" width="24" height="24" />Freely Forms</a
            >
            <nav class="main" aria-label="Main">
              ${NAV.map(
                ([href, label]) =>
                  html`<a href="${href}" ${meta.path === href ? raw('aria-current="page"') : ""}
                    >${label}</a
                  >`,
              )}
            </nav>
            <a class="btn primary" href="/app/">Create a form</a>
          </div>
        </header>
        <main>${body}</main>
        ${
          meta.fitFrames
            ? html`<script nonce="${ctx.nonce}">
                ${raw(FIT_FRAMES)};
              </script>`
            : ""
        }
        <footer class="site">
          <div class="wrap">
            <div class="cols">
              ${FOOTER.map(
                ([heading, links]) =>
                  html`<div>
                    <h4>${heading}</h4>
                    <ul>
                      ${links.map(([href, label]) => html`<li><a href="${href}">${label}</a></li>`)}
                    </ul>
                  </div>`,
              )}
            </div>
            <p class="muted small fine">
              © Freely Forms. Not affiliated with Google. Google Sheets and Google Drive are
              trademarks of Google LLC.
            </p>
          </div>
        </footer>
      </body>
    </html>`;
}

/**
 * The CSP for website pages: our inline style and script only; frames only our own previews.
 * Forms may post only where a page allows (by default nowhere).
 */
export const siteCsp = (nonce: string, formAction = "'none'") =>
  `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src 'self' data:; frame-src 'self'; base-uri 'none'; form-action ${formAction}; frame-ancestors 'none'`;
