import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

/**
 * Privacy policy and terms, served at /privacy and /terms on the app domain. Plain server-rendered
 * pages: they must be reachable without JavaScript (Google's OAuth verification links to them).
 * Keep them in step with docs/SECURITY_PRIVACY.md and ADR 0008.
 */

export const LEGAL_UPDATED = "16 October 2026";
const CONTACT = "hello@freelyforms.com";

const STYLE = `
:root{color-scheme:light dark;--fg:#1b1b1f;--muted:#5d5d66;--bg:#fff;--accent:#1f5fd6}
@media (prefers-color-scheme:dark){:root{--fg:#ececf1;--muted:#a5a5ae;--bg:#141417;--accent:#8ab0ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 64px}a{color:var(--accent)}
h1{font-size:1.8rem;line-height:1.25}h2{font-size:1.2rem;margin-top:2em}.muted{color:var(--muted)}
nav{display:flex;gap:16px;font-size:.95rem}
`;

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export function legalPage(title: string, body: Html, nonce: string): Html {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title} · Freely Forms</title>
        <style nonce="${nonce}">
          ${raw(STYLE)}
        </style>
      </head>
      <body>
        <main>
          <nav>
            <a href="/app/">Freely Forms</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>
          </nav>
          <h1>${title}</h1>
          <p class="muted">Last updated ${LEGAL_UPDATED}</p>
          ${body}
        </main>
      </body>
    </html>`;
}

export const privacyBody = html`
  <p>
    Freely Forms is a free, non-commercial, open-source form builder. Forms are built with Freely
    Forms; the responses go to the form owner's own Google Sheet. This policy explains what we
    handle, why, and for how long. Questions: <a href="mailto:${CONTACT}">${CONTACT}</a>.
  </p>

  <h2>The short version</h2>
  <ul>
    <li>
      We do not keep a database of form responses. A response may be held temporarily, encrypted,
      while it is being delivered to the owner's Google Sheet. Undelivered responses are deleted
      automatically no later than 7 days after submission.
    </li>
    <li>
      We ask Google only for your name, email address and access to the files Freely Forms creates
      (or that you pick) in your Drive. We cannot see the rest of your Drive.
    </li>
    <li>
      No advertising, no selling of data, no tracking cookies, and no use of responses to train AI
      models.
    </li>
  </ul>

  <h2>If you build forms (form owners)</h2>
  <p>When you sign in with Google we store:</p>
  <ul>
    <li>your Google account ID, email address and name;</li>
    <li>
      the Google permissions you granted, and a Google refresh token, encrypted, so we can write
      responses to your sheet while you are away;
    </li>
    <li>
      your form definitions (titles, questions, options, settings) and their published versions;
    </li>
    <li>the ID of each response spreadsheet we created for you, and its connection state;</li>
    <li>
      delivery records for each response: an ID, the form, timestamps, the delivery state, attempt
      counts and error codes. They contain no answers and are deleted after 30 days;
    </li>
    <li>a session record that holds only a hash of your session token, for at most 30 days.</li>
  </ul>

  <h2>Google user data</h2>
  <p>Freely Forms requests these Google permissions:</p>
  <ul>
    <li><strong>openid, email, profile</strong> — to sign you in and show who is signed in.</li>
    <li>
      <strong>drive.file</strong> — to create a response spreadsheet in your Drive and add rows,
      columns and column labels to the spreadsheets Freely Forms created or that you choose. It does
      not give access to any other file.
    </li>
  </ul>
  <p>
    We use Google user data only to provide these features to you. We do not use it for advertising,
    do not sell it, do not let people read it except when you ask us to help or when the law
    requires it, and do not use it to train AI models. Freely Forms' use and transfer of information
    received from Google APIs to any other app will adhere to the
    <a href="https://developers.google.com/terms/api-services-user-data-policy"
      >Google API Services User Data Policy</a
    >, including the Limited Use requirements.
  </p>

  <h2>If you fill in a form (respondents)</h2>
  <p>
    Your answers belong to the person or organisation that published the form. They decide what the
    form asks and what happens to your answers in their spreadsheet; ask them about your data.
    Freely Forms only carries your answers to their Google Sheet:
  </p>
  <ul>
    <li>
      Answers are encrypted as soon as they arrive and wait in a delivery queue until they are
      written to the sheet, usually within seconds.
    </li>
    <li>
      If the owner's sheet is unavailable, the encrypted answers wait at most 7 days and are then
      deleted, delivered or not.
    </li>
    <li>
      After delivery we delete our copy immediately. We keep only a delivery record without your
      answers (see above).
    </li>
  </ul>
  <p>
    To stop spam we use your IP address for rate limiting and, when enabled, Cloudflare Turnstile, a
    privacy-focused challenge instead of a CAPTCHA. We do not store your IP address in our database.
  </p>

  <h2>Cookies</h2>
  <p>
    Only form owners get cookies from us, and only essential ones: a session cookie (up to 30 days)
    and a short-lived cookie that protects the Google sign-in (10 minutes). We set no cookies on
    forms, and we use no analytics or advertising cookies.
  </p>

  <h2>Service providers</h2>
  <ul>
    <li>
      <strong>Cloudflare</strong> runs our servers, database, delivery queue, temporary encrypted
      storage and Turnstile. Its systems record request metadata (such as time, path and status) in
      short-lived logs.
    </li>
    <li>
      <strong>Google</strong> provides sign-in and stores responses in the owner's Google Sheets
      under the owner's Google account.
    </li>
  </ul>

  <h2>Security</h2>
  <p>
    Refresh tokens and queued responses are encrypted with keys kept outside our database. Our
    source code is public, so anyone can check how data is handled.
  </p>

  <h2>Your choices</h2>
  <ul>
    <li>
      On the Account page you can disconnect Google or delete your account. Deleting it removes your
      forms, their history and all records above, revokes our Google access and discards responses
      still waiting for delivery. Your spreadsheets stay in your Drive.
    </li>
    <li>
      You can also remove Freely Forms' access at
      <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
    </li>
    <li>
      For any other request about your data, write to <a href="mailto:${CONTACT}">${CONTACT}</a>.
    </li>
  </ul>

  <h2>Changes</h2>
  <p>We will update this page when the service changes and note the date above.</p>
`;

export const termsBody = html`
  <p>
    Freely Forms is a free, non-commercial, open-source project. By using it you agree to these
    terms. Questions: <a href="mailto:${CONTACT}">${CONTACT}</a>.
  </p>

  <h2>The service</h2>
  <p>
    Freely Forms lets you build forms and receive responses in your own Google Sheet. It is offered
    free of charge, as is, without any warranty, and may change or stop at any time. We aim to
    deliver every response, but delivery depends on Google and on your sheet staying available;
    undelivered responses are deleted after 7 days (see the <a href="/privacy">privacy policy</a>).
    Keep your own records of anything important.
  </p>

  <h2>Your responsibilities</h2>
  <ul>
    <li>
      You are responsible for your forms, for what they ask, and for handling respondents' data
      lawfully, including telling respondents how you use it.
    </li>
    <li>
      Do not use Freely Forms for phishing or to collect passwords, payment card numbers or other
      credentials.
    </li>
    <li>
      Do not use it for spam, malware, harassment, illegal content or anything that infringes
      others' rights.
    </li>
    <li>
      Do not collect sensitive data such as health information unless you are allowed to and have
      the safeguards the law requires.
    </li>
    <li>Do not try to disrupt the service, get around its limits or access other people's data.</li>
  </ul>

  <h2>Abuse</h2>
  <p>
    Every published form has a "Report abuse" link. We may disable forms or accounts that break
    these terms, without notice when needed to protect others.
  </p>

  <h2>Your content</h2>
  <p>
    Your forms and your responses remain yours. You can export a form as JSON at any time. The
    Freely Forms source code is available under the Apache License 2.0.
  </p>

  <h2>Liability</h2>
  <p>
    To the extent the law allows, Freely Forms and its contributors are not liable for any loss
    arising from the use of the service, including lost or delayed responses.
  </p>

  <h2>Changes and ending</h2>
  <p>
    We may update these terms and will note the date above. You can stop using Freely Forms and
    delete your account at any time from the Account page.
  </p>
`;
