import { answerFields } from "@freelyforms/form-schema";
import { headerLabels, SYSTEM_COLUMNS } from "@freelyforms/google";
import { html } from "hono/html";
import { breadcrumbs, type Html, type PageMeta } from "./layout.js";
import { TEMPLATES, type Template } from "./templates.js";

const REPO_URL = "https://github.com/freelyforms/freelyforms";

/**
 * Website pages. Every claim here describes what the product does today; keep it in step with
 * docs/ROADMAP.md, the privacy policy and docs/SECURITY_PRIVACY.md.
 */

export interface Page {
  meta: PageMeta;
  body: Html;
}

/** A Sheets-like table of the columns a form produces, with sample rows. */
export function sheetMock(columns: string[], rows: string[][]): Html {
  return html`<div class="sheet-wrap">
    <table class="sheet">
      <thead>
        <tr>
          <th></th>
          ${columns.map((c) => html`<th>${c}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          (r, i) =>
            html`<tr>
              <td class="n">${i + 2}</td>
              ${r.map((v) => html`<td>${v}</td>`)}
            </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

const previewFrame = (slug: string, label: string) =>
  html`<div class="frame">
    <div class="frame-head">${label}<span class="muted">· preview, nothing is sent</span></div>
    <iframe title="${label} preview" src="/templates/${slug}/preview" loading="lazy"></iframe>
  </div>`;

const templateCards = (list: Template[]) =>
  html`<ul class="tpl-list">
    ${list.map(
      (t) =>
        html`<li>
          <a class="tpl" href="/templates/${t.slug}/"
            ><strong>${t.name}</strong
            ><span class="muted small"
              >${t.form.fields.length} fields · ${t.intro.split(". ")[0]}.</span
            ><span class="go" aria-hidden="true">View template →</span></a
          >
        </li>`,
    )}
  </ul>`;

export const home: Page = {
  meta: {
    title: "Free form builder — responses go to your Google Sheet | Freely Forms",
    description:
      "Build and share online forms for free. Every response is written to a Google Sheet in your own Drive, not kept in another app's database.",
    path: "/",
    fitFrames: true,
    // The organization, the site and the app, linked by @id; the author is described on their own site.
    jsonLd: (origin) => ({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": `${origin}/#organization`,
          name: "Freely Forms",
          url: `${origin}/`,
          logo: `${origin}/app/brand/icon-512.png`,
          email: "hello@freelyforms.com",
          sameAs: ["https://github.com/freelyforms"],
        },
        {
          "@type": "WebSite",
          "@id": `${origin}/#website`,
          name: "Freely Forms",
          url: `${origin}/`,
          publisher: { "@id": `${origin}/#organization` },
        },
        {
          "@type": "WebApplication",
          "@id": `${origin}/#software`,
          name: "Freely Forms",
          url: `${origin}/`,
          description:
            "Free, open-source form builder. Every response is written to a Google Sheet in the form owner's own Drive.",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          publisher: { "@id": `${origin}/#organization` },
          author: { "@id": "https://grigoryfrolov.com/about/#person" },
        },
      ],
    }),
  },
  body: html`
    <section>
      <div class="wrap demo">
        <div>
          <p class="eyebrow">Freely Forms · free form builder</p>
          <h1>Free forms that write to your Google Sheet</h1>
          <p class="lead">
            Freely Forms is a free, open-source form builder. Build and publish online forms without
            a separate response database: responses are delivered as new rows in a Google Sheet you
            own.
          </p>
          <div class="actions">
            <a class="btn primary" href="/app/">Create a free form</a>
            <a class="btn" href="/how-it-works/">See how it works</a>
          </div>
          <ul class="ticks">
            <li>No caps on forms or responses</li>
            <li>Respondents don't need a Google account</li>
            <li>Use a new or existing Google Sheet</li>
          </ul>
        </div>
        ${previewFrame("contact-form", "Contact form")}
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>What lands in your sheet</h2>
        <p class="lead">
          Each response is one row. Freely Forms adds an ID, a timestamp and the form version, then
          one column per question, so nothing gets mixed up when you edit the form later.
        </p>
        ${sheetMock(
          [...SYSTEM_COLUMNS, "Name", "Email", "What is it about?", "Message"],
          [
            [
              "01JA…7K2Q",
              "2026-10-16T09:14:05.000Z",
              "1",
              "Sam Taylor",
              "sam@example.com",
              "A question",
              "Do you deliver to Wellington?",
            ],
            [
              "01JA…9MPD",
              "2026-10-16T11:02:41.000Z",
              "1",
              "Priya Shah",
              "priya@example.com",
              "Pricing or a quote",
              "Could you quote for 40 units?",
            ],
          ],
        )}
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>How it works</h2>
        <ol class="steps">
          <li>
            <h3>Build your form</h3>
            <p>
              Pick fields, write your questions and set your colours. A live preview shows exactly
              what people will see.
            </p>
          </li>
          <li>
            <h3>Connect Google Sheets</h3>
            <p>Publishing creates a spreadsheet in your Drive, or adds a tab to one you choose.</p>
          </li>
          <li>
            <h3>Share or embed</h3>
            <p>
              Send the link or paste the embed code into your website. Responses arrive as rows,
              usually within seconds.
            </p>
          </li>
        </ol>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Why it's different</h2>
        <div class="grid">
          <div class="card">
            <h3>Your sheet is the destination</h3>
            <p>
              Responses go to a Google Sheet you control. Sort, share and chart them with tools you
              already use.
            </p>
          </div>
          <div class="card">
            <h3>Narrow access to your Google account</h3>
            <p>
              Freely Forms can open only the spreadsheets it creates or that you choose for it. It
              cannot see the rest of your Drive.
            </p>
          </div>
          <div class="card">
            <h3>No permanent response database</h3>
            <p>
              Delivered responses live in your sheet, not in a separate Freely Forms inbox.
              <a href="/security/">How data is handled</a>
            </p>
          </div>
          <div class="card">
            <h3>No artificial limits</h3>
            <p>
              No paid tier for more forms or more responses. <a href="/why-free/">Why it's free</a>
            </p>
          </div>
        </div>
      </div>
    </section>

    <section>
      <div class="wrap prose">
        <h2>How Freely Forms uses your Google account</h2>
        <p>
          You sign in to Freely Forms with Google. The app asks for two things, and uses them only
          to run your forms:
        </p>
        <ul>
          <li>
            <strong>Your name and email address</strong>, to identify your account and show who is
            signed in.
          </li>
          <li>
            <strong>Access to the spreadsheets Freely Forms creates or that you pick</strong>
            (Google's <code>drive.file</code> permission), to create the response spreadsheet, add
            its columns and append each response as a row. It can't open your other files.
          </li>
        </ul>
        <p>
          People who fill in your forms don't sign in and don't need a Google account. Google user
          data is never sold, used for advertising or used to train AI models, and you can
          disconnect Google or delete your account at any time. Read the
          <a href="/privacy">privacy policy</a> and the <a href="/terms">terms</a>.
        </p>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Start from a template</h2>
        <p class="lead">Each template is a real form you can copy and change.</p>
        ${templateCards(TEMPLATES.slice(0, 6))}
        <p><a class="btn" href="/templates/">Browse all templates</a></p>
      </div>
    </section>

    <section>
      <div class="wrap demo">
        <div>
          <h2>Put it on your website</h2>
          <p>
            Paste a short snippet where the form should appear. The form keeps its own styles and
            adjusts its height to fit.
          </p>
          <p><a href="/features/embed/">Embedding a form</a></p>
        </div>
        <pre><code>&lt;iframe data-freelyforms src="https://freelyforms.link/frm_…"
  title="Contact us" width="100%" height="600" style="border:0;width:100%"
  loading="lazy"&gt;&lt;/iframe&gt;
&lt;script src="https://freelyforms.link/embed.js" async&gt;&lt;/script&gt;</code></pre>
      </div>
    </section>

    <section>
      <div class="wrap narrow">
        <h2>Create your first form</h2>
        <p class="lead">Sign in with Google and you're in the builder. It takes a minute.</p>
        <div class="actions"><a class="btn primary" href="/app/">Create a free form</a></div>
      </div>
    </section>
  `,
};

export const howItWorks: Page = {
  meta: {
    title: "How Freely Forms works: your forms, your Google Sheet",
    description:
      "Where responses go, what Freely Forms stores and doesn't, and the Google permissions it uses — explained in plain words.",
    path: "/how-it-works/",
  },
  body: html`<section>
    <div class="wrap prose">
      <p class="eyebrow">How it works</p>
      <h1>Your forms. Your Google Sheet.</h1>
      <p class="lead">
        Freely Forms is the form; Google Sheets is the database. Here is what happens between the
        two.
      </p>
      <div class="flow" aria-label="Data flow">
        <span>Respondent</span><b>→</b><span>Freely Forms</span><b>→</b
        ><span>Your Google Sheet</span>
      </div>

      <h2>1. You build and publish a form</h2>
      <p>
        You sign in with Google and build the form in the browser. When you publish, Freely Forms
        creates a spreadsheet in your Google Drive (or adds a tab to one you pick in Google's file
        picker) with one column per question.
      </p>
      <h2>2. Someone fills it in</h2>
      <p>
        Your form has its own link on freelyforms.link and can be embedded on any website.
        Respondents don't need a Google account. Answers are checked against the form's rules before
        they are accepted, and spam is filtered with Cloudflare Turnstile and rate limits.
      </p>
      <h2>3. The answer becomes a row in your sheet</h2>
      <p>
        Accepted answers are encrypted and queued, then written to your sheet, usually within
        seconds. If Google is unavailable, delivery is retried automatically for up to 72 hours. If
        your sheet has been deleted or access was removed, responses wait, encrypted, for up to 7
        days for you to fix it, and are deleted after that.
      </p>
      <h2>What Freely Forms stores</h2>
      <ul>
        <li>Your account: Google account ID, name and email.</li>
        <li>Your forms: questions, settings and published versions.</li>
        <li>Delivery records without answers (IDs, times, status), kept for 30 days.</li>
        <li>An encrypted Google token so responses can be written while you're away.</li>
      </ul>
      <h2>What it doesn't</h2>
      <ul>
        <li>A permanent copy of your responses: once delivered, they live only in your sheet.</li>
        <li>
          The rest of your Google Drive: the permission it uses covers only files Freely Forms
          creates or that you explicitly select.
        </li>
      </ul>
      <h2>Google permissions</h2>
      <p>
        Sign-in asks for your name and email, and for <code>drive.file</code>, Google's narrowest
        Drive permission: access only to files the app creates or that you choose for it. You can
        disconnect Google or delete your account at any time from the Account page.
      </p>
      <h2>Common questions</h2>
      <h3>Do respondents need a Google account?</h3>
      <p>No. Anyone with the link can answer.</p>
      <h3>Can I use a spreadsheet I already have?</h3>
      <p>
        Yes. Choose it in Google's file picker; Freely Forms adds its own tab and leaves your other
        tabs alone.
      </p>
      <h3>What if I rename or move columns?</h3>
      <p>
        Columns are matched by a hidden ID, not by their header, so reordering them is fine, and a
        header you rename yourself is kept. When you rename a question, its column header follows,
        unless you've already changed that header by hand.
      </p>
      <h3>Can a response run a formula in my sheet?</h3>
      <p>
        No. Answers are written as plain values, so text like <code>=IMPORTXML(…)</code> stays text.
      </p>
      <div class="actions">
        <a class="btn primary" href="/app/">Create a free form</a
        ><a class="btn" href="/security/">Security details</a>
      </div>
    </div>
  </section>`,
};

export const whyFree: Page = {
  meta: {
    title: "Why Freely Forms is free — no form or response limits",
    description:
      "Responses live in your own Google Sheet instead of our database, which keeps Freely Forms cheap to run. Here's why there's no paid tier for forms or responses.",
    path: "/why-free/",
  },
  body: html`<section>
    <div class="wrap prose">
      <p class="eyebrow">Why free</p>
      <h1>Why Freely Forms is free</h1>
      <p class="lead">
        Your responses live in your Google Sheet instead of our database. That keeps our
        infrastructure small and inexpensive, so we don't need to charge for forms or submissions.
      </p>
      <h2>Where the cost of a form builder usually goes</h2>
      <p>
        Many form builders store responses in their own databases and meter usage by forms,
        responses or storage, which is why their free plans have caps.
      </p>
      <h2>What we do instead</h2>
      <p>
        Freely Forms carries each response to your Google Sheet and then lets it go. Because we
        don't maintain a permanent response database for every user, our storage costs stay low.
      </p>
      <h2>What "no limits" means</h2>
      <ul>
        <li>No cap on the number of forms or responses, and no paid tier to unlock more.</li>
        <li>
          Abuse protection still applies: rapid repeat submissions from one network are slowed down.
        </li>
        <li>Google's own limits apply to your sheet, such as its maximum number of cells.</li>
      </ul>
      <h2>Who runs it</h2>
      <p>
        Freely Forms is an independent, non-commercial project, and its code is
        <a href="/open-source/">open source</a>.
      </p>
      <div class="actions"><a class="btn primary" href="/app/">Create a free form</a></div>
    </div>
  </section>`,
};

export const openSource: Page = {
  meta: {
    title: "Open source: Freely Forms code, licence and contributing",
    description:
      "Freely Forms is open source under Apache-2.0. Read the code, check what it does with your data, report a vulnerability or contribute on GitHub.",
    path: "/open-source/",
  },
  body: html`<section>
    <div class="wrap prose">
      <p class="eyebrow">Open source</p>
      <h1>Freely Forms is open source</h1>
      <p class="lead">
        The builder, the public forms, the delivery to Google Sheets and this website are all in one
        public repository:
        <a href="${REPO_URL}">github.com/freelyforms/freelyforms</a>.
      </p>
      <h2>Why it matters for a form tool</h2>
      <p>
        A form builder sits between your respondents and your Google account. With the code public,
        you don't have to take our word for what happens on that path: you can read which Google
        permissions are requested, how responses are encrypted while they wait, and when they're
        deleted.
      </p>
      <ul>
        <li>
          <a href="${REPO_URL}/blob/main/docs/SECURITY_PRIVACY.md">Security and privacy design</a>
        </li>
        <li><a href="${REPO_URL}/blob/main/docs/GOOGLE_INTEGRATION.md">Google integration</a></li>
        <li><a href="${REPO_URL}/tree/main/docs/adr">Architecture decisions</a></li>
        <li>
          <a href="${REPO_URL}/blob/main/docs/FORM_SCHEMA.md">Form schema</a> (forms export as JSON)
        </li>
      </ul>
      <h2>Licence</h2>
      <p>
        Apache License 2.0: you may use, modify and redistribute the code, including commercially,
        under its terms. Contributors sign a short
        <a href="${REPO_URL}/blob/main/CLA.md">contributor licence agreement</a>; it's a licence,
        not a transfer of copyright.
      </p>
      <h2>Running it yourself</h2>
      <p>
        The hosted service runs on Cloudflare Workers with D1, Queues and KV. You can run the same
        code locally by following the
        <a href="${REPO_URL}/blob/main/CONTRIBUTING.md">contributing guide</a>. A step-by-step
        self-hosting guide isn't written yet.
      </p>
      <h2>Report a vulnerability</h2>
      <p>
        Please report privately through
        <a href="${REPO_URL}/security/advisories/new">GitHub's private vulnerability reporting</a>
        or to hello@freelyforms.com with the subject <code>SECURITY</code>, not in a public issue.
      </p>
      <h2>Contribute</h2>
      <p>
        Bug reports and pull requests are welcome. Start with
        <a href="${REPO_URL}/issues">the issues</a> and the contributing guide.
      </p>
      <div class="actions">
        <a class="btn primary" href="${REPO_URL}">View on GitHub</a
        ><a class="btn" href="/app/">Create a free form</a>
      </div>
    </div>
  </section>`,
};

export const security: Page = {
  meta: {
    title: "Security and data handling | Freely Forms",
    description:
      "Google permissions, encryption, retention and deletion at Freely Forms: what we access, what we keep, and for how long.",
    path: "/security/",
  },
  body: html`<section>
    <div class="wrap prose">
      <p class="eyebrow">Security</p>
      <h1>Security and data handling</h1>
      <p class="lead">
        The short, factual version. The <a href="/privacy">privacy policy</a> has the full detail.
      </p>
      <h2>Access to your Google account</h2>
      <ul>
        <li>
          Permissions: your name and email, and <code>drive.file</code>, which covers only
          spreadsheets Freely Forms creates or that you choose for it.
        </li>
        <li>
          Your long-lived Google token is stored encrypted, with keys kept outside our database, and
          never sent to the browser. Only Google's file picker gets a short-lived token while it's
          open.
        </li>
        <li>
          You can disconnect Google or delete your account at any time; your spreadsheets stay in
          your Drive.
        </li>
      </ul>
      <h2>Responses</h2>
      <ul>
        <li>
          Answers are encrypted as soon as they're accepted and kept only until they're written to
          your sheet.
        </li>
        <li>
          If delivery is blocked (for example, the sheet was deleted), encrypted answers wait at
          most 7 days, then they're deleted.
        </li>
        <li>
          Delivery records keep IDs, times and status, never answers, and are deleted after 30 days.
        </li>
        <li>Answers are written as plain values: a response can't run a formula in your sheet.</li>
      </ul>
      <h2>Public forms</h2>
      <ul>
        <li>
          Forms are served from a separate domain, freelyforms.link, where Freely Forms sets no
          cookies.
        </li>
        <li>Spam protection: Cloudflare Turnstile, rate limits and a hidden honeypot field.</li>
        <li>Every form has a "Report abuse" link.</li>
      </ul>
      <h2>Reporting a vulnerability</h2>
      <p>
        Email <a href="mailto:hello@freelyforms.com?subject=SECURITY">hello@freelyforms.com</a> with
        the subject SECURITY.
      </p>
    </div>
  </section>`,
};

export const googleSheets: Page = {
  meta: {
    title: "Form builder for Google Sheets — send form responses to a sheet",
    description:
      "Connect a form to Google Sheets in one step: a new spreadsheet or one you already have. Columns follow your questions, even when you edit the form.",
    path: "/integrations/google-sheets/",
  },
  body: html`<section>
      <div class="wrap prose">
        <p class="eyebrow">Integrations · Google Sheets</p>
        <h1>Send form responses straight to Google Sheets</h1>
        <p class="lead">
          Every Freely Forms form writes to a Google Sheet in your Drive. No add-ons, no automation
          tools in between.
        </p>
        <div class="actions"><a class="btn primary" href="/app/">Create a form</a></div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>The sheet you get</h2>
        <p class="lead">A header row with system columns first, then one column per question.</p>
        ${sheetMock(
          [...SYSTEM_COLUMNS, "Full name", "Email", "Ticket", "Additional guests"],
          [
            [
              "01JA…3TQR",
              "2026-10-16T18:40:12.000Z",
              "2",
              "Alex Kim",
              "alex@example.com",
              "Student",
              "1",
            ],
            [
              "01JA…5VBN",
              "2026-10-16T19:05:37.000Z",
              "2",
              "Jo Brown",
              "jo@example.com",
              "General admission",
              "0",
            ],
          ],
        )}
      </div>
    </section>
    <section>
      <div class="wrap prose">
        <h2>New sheet or your own</h2>
        <p>
          Publishing creates a spreadsheet called "&lt;form name&gt; (responses)". To use a
          spreadsheet you already have, choose it in Google's file picker before you publish: Freely
          Forms adds its own tab and doesn't touch your other tabs.
        </p>
        <h2>Edit the form without breaking the sheet</h2>
        <ul>
          <li>New questions get new columns at the end, after any columns you added yourself.</li>
          <li>
            Columns are matched by a hidden field ID, so you can reorder columns and rename headers;
            renaming a question updates its header unless you've edited it by hand.
          </li>
          <li>Removed questions keep their column, so past answers stay where they were.</li>
        </ul>
        <h2>Reliable delivery</h2>
        <ul>
          <li>
            Responses are batched and retried if Google is busy, and each carries a unique ID, so
            retries are designed not to write the same response twice.
          </li>
          <li>
            Choices are written as their labels, numbers as numbers and checkboxes as TRUE/FALSE.
          </li>
          <li>Answers are never run as formulas.</li>
          <li>
            If the sheet is deleted or access is removed, the form keeps accepting answers for up to
            7 days while you fix it, and the builder tells you what happened.
          </li>
        </ul>
        <div class="actions">
          <a class="btn primary" href="/app/">Create a form</a
          ><a class="btn" href="/how-it-works/">How it works</a>
        </div>
      </div>
    </section>`,
};

export const embed: Page = {
  meta: {
    title: "Embed a form on your website — free, resizes automatically",
    description:
      "Add a Freely Forms form to any website with a short iframe snippet. It resizes to fit and sends every response to your Google Sheet.",
    path: "/features/embed/",
  },
  body: html`<section>
    <div class="wrap prose">
      <p class="eyebrow">Features · Embed</p>
      <h1>Embed a form on your website</h1>
      <p class="lead">
        Copy the snippet from the Publish tab and paste it where the form should appear. That's the
        whole setup.
      </p>
      <pre><code>&lt;iframe data-freelyforms src="https://freelyforms.link/frm_…"
  title="Contact us" width="100%" height="600" style="border:0;width:100%"
  loading="lazy"&gt;&lt;/iframe&gt;
&lt;script src="https://freelyforms.link/embed.js" async&gt;&lt;/script&gt;</code></pre>
      <h2>What the snippet does</h2>
      <ul>
        <li>
          The iframe shows your form from freelyforms.link, with your colours and light or dark
          theme.
        </li>
        <li>
          The small script adjusts the iframe's height to the form, including the thank-you message
          after submitting.
        </li>
        <li>Without the script the form still works, at the fixed height you set.</li>
      </ul>
      <h2>Where it works</h2>
      <p>
        Anywhere you can paste HTML: site builders with an "embed" or "custom HTML" block, static
        sites and web apps. Some builders strip scripts; the form still works there at a fixed
        height.
      </p>
      <h2>Prefer a link?</h2>
      <p>Every form also has its own page you can share as a link.</p>
      <div class="actions"><a class="btn primary" href="/app/">Create a form</a></div>
    </div>
  </section>`,
};

/** Hub sections, in display order. Every template belongs to exactly one (checked in tests). */
export const TEMPLATE_GROUPS: { heading: string; slugs: string[] }[] = [
  {
    heading: "Customers and sales",
    slugs: [
      "contact-form",
      "lead-generation-form",
      "quote-request-form",
      "order-form",
      "client-intake-form",
    ],
  },
  {
    heading: "Events and sign-ups",
    slugs: ["event-registration-form", "registration-form", "rsvp-form", "volunteer-form"],
  },
  {
    heading: "Feedback and evaluations",
    slugs: [
      "feedback-form",
      "customer-satisfaction-survey",
      "complaint-form",
      "anonymous-feedback-form",
      "course-evaluation-form",
      "employee-evaluation-form",
    ],
  },
  {
    heading: "People and HR",
    slugs: ["job-application-form", "employee-onboarding-form", "time-off-request-form"],
  },
  {
    heading: "Operations and internal requests",
    slugs: [
      "project-intake-form",
      "it-request-form",
      "purchase-order-form",
      "work-order-form",
      "incident-report-form",
    ],
  },
  {
    heading: "Property",
    slugs: ["rental-application-form", "maintenance-request-form"],
  },
];

const bySlugs = (slugs: string[]) =>
  slugs.flatMap((slug) => TEMPLATES.filter((t) => t.slug === slug));

export const templatesHub: Page = {
  meta: {
    title: "Free form templates that save to Google Sheets | Freely Forms",
    description:
      "Forms for sales, events, feedback, HR, operations and rentals. Preview each one, see its sheet columns, then copy it into your own account.",
    path: "/templates/",
    jsonLd: breadcrumbs([["Templates", "/templates/"]]),
  },
  body: html`<section>
    <div class="wrap">
      <p class="eyebrow">Templates</p>
      <h1>Form templates</h1>
      <p class="lead">
        Real forms you can preview here and copy into your account. Each shows the exact columns
        you'll get in your Google Sheet.
      </p>
      ${TEMPLATE_GROUPS.map(
        (g) =>
          html`<h2 class="tpl-group">${g.heading}</h2>
            ${templateCards(bySlugs(g.slugs))}`,
      )}
    </div>
  </section>`,
};

/** Up to three templates from the same hub section, then from the rest. */
function relatedTemplates(t: Template): Template[] {
  const group = TEMPLATE_GROUPS.find((g) => g.slugs.includes(t.slug))?.slugs ?? [];
  const start = group.indexOf(t.slug);
  const sameGroup = [...group.slice(start + 1), ...group.slice(0, start)];
  const others = TEMPLATES.map((x) => x.slug).filter((s) => !group.includes(s));
  return bySlugs([...sameGroup, ...others].slice(0, 3));
}

export function templatePage(t: Template): Page {
  const columns = [...SYSTEM_COLUMNS, ...headerLabels(t.form)];
  const useUrl = `/app/?template=${encodeURIComponent(t.slug)}`;
  return {
    meta: {
      title: t.title,
      description: t.description,
      path: `/templates/${t.slug}/`,
      fitFrames: true,
      jsonLd: breadcrumbs([
        ["Templates", "/templates/"],
        [t.name, `/templates/${t.slug}/`],
      ]),
    },
    body: html`<section>
        <div class="wrap">
          <p class="crumbs"><a href="/templates/">Templates</a> / ${t.name}</p>
          <div class="demo">
            <div>
              <h1>${t.name}</h1>
              <p class="lead">${t.intro}</p>
              <div class="actions">
                <a class="btn primary" href="${useUrl}">Use this template</a>
              </div>
              <p class="muted small">
                Copies the form into your account after you sign in with Google. You can change
                anything before publishing.
              </p>
            </div>
            ${previewFrame(t.slug, t.name)}
          </div>
        </div>
      </section>
      <section>
        <div class="wrap">
          <h2>Columns in your Google Sheet</h2>
          <p class="lead">Each response becomes one row with these columns.</p>
          ${sheetMock(columns, [])}
        </div>
      </section>
      <section>
        <div class="wrap prose">
          <h2>What this form asks, and why</h2>
          <ul class="fields">
            ${answerFields(t.form).map(
              (f) =>
                html`<li>
                  <b
                    >${f.label}${"required" in f && f.required ? html`<span class="tag">required</span>` : ""}</b
                  >
                  <span class="muted">${t.why[f.id] ?? ""}</span>
                </li>`,
            )}
          </ul>
          <h2>Fields people often add</h2>
          <ul>
            ${t.extras.map((e) => html`<li>${e}</li>`)}
          </ul>
          <h2>Common mistakes</h2>
          <ul>
            ${t.pitfalls.map((p) => html`<li>${p}</li>`)}
          </ul>
          <h2>Share it or put it on your site</h2>
          <p>
            Publish to get a link on freelyforms.link, or
            <a href="/features/embed/">embed it on your website</a>. Responses go to
            <a href="/integrations/google-sheets/">your Google Sheet</a>.
          </p>
          <div class="actions"><a class="btn primary" href="${useUrl}">Use this template</a></div>
        </div>
      </section>
      <section>
        <div class="wrap">
          <h2>Other templates</h2>
          ${templateCards(relatedTemplates(t))}
        </div>
      </section>`,
  };
}

export const notFound: Page = {
  meta: {
    title: "Page not found | Freely Forms",
    description: "This page does not exist.",
    path: "/404",
  },
  body: html`<section>
    <div class="wrap prose">
      <h1>Page not found</h1>
      <p class="lead">This page doesn't exist or has moved.</p>
      <div class="actions">
        <a class="btn primary" href="/">Go to the homepage</a
        ><a class="btn" href="/templates/">Browse templates</a>
      </div>
    </div>
  </section>`,
};

export const serverError: Page = {
  meta: {
    title: "Something went wrong | Freely Forms",
    description: "Something went wrong on our side.",
    path: "/500",
  },
  body: html`<section>
    <div class="wrap prose">
      <h1>Something went wrong</h1>
      <p class="lead">
        Something failed on our side. Please try again in a moment; if it keeps happening, write to
        <a href="mailto:hello@freelyforms.com">hello@freelyforms.com</a>.
      </p>
      <div class="actions"><a class="btn primary" href="/">Go to the homepage</a></div>
    </div>
  </section>`,
};
