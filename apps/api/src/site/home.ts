import { html } from "hono/html";

/**
 * Homepage until the public website exists. Google's OAuth verification needs a page on the app's
 * domain that describes the app and links the privacy policy. Claims here are limited to what is
 * shipped (docs/ROADMAP.md).
 */
export const homeBody = html`
  <h1>Free forms that send responses to your own Google Sheet</h1>
  <p class="lead">
    Build a form, share a link or embed it on your website, and every response is written to a
    Google Sheet in your own Drive. Freely Forms keeps no database of your responses.
  </p>
  <p><a class="cta" href="/app/">Start building</a></p>
  <p class="muted">
    Early preview: sign-in is limited to invited testers until Google completes its review of the
    app.
  </p>

  <h2>How it works</h2>
  <ol class="steps">
    <li>
      Sign in with Google and build a form: short and long text, email, phone, number, date,
      choices, checkboxes and consent.
    </li>
    <li>
      Publish it. Freely Forms creates a response spreadsheet in your Drive and gives you a link and
      an embed code.
    </li>
    <li>
      People answer without a Google account. Each response becomes a new row in your sheet, usually
      within seconds.
    </li>
  </ol>

  <h2>What you get today</h2>
  <ul class="list">
    <li>A live preview while you edit, your accent colour, and light or dark style.</li>
    <li>Embedding on any website, with automatic height.</li>
    <li>
      Spam protection without CAPTCHAs (Cloudflare Turnstile) and a "Report abuse" link on every
      form.
    </li>
    <li>Answers are written as plain values, never run as spreadsheet formulas.</li>
    <li>
      Your data stays yours: responses live in your sheet, forms can be exported as JSON, and
      deleting your account never touches your Drive.
    </li>
    <li>
      Free, without limits on forms or responses, and open source under the Apache License 2.0.
    </li>
  </ul>

  <h2>What Freely Forms can access</h2>
  <p>
    Your name and email address, and only the files Freely Forms creates in your Google Drive. It
    cannot see anything else in your Drive. Read the <a href="/privacy">privacy policy</a> and the
    <a href="/terms">terms of use</a>.
  </p>

  <p class="muted">
    Freely Forms is a non-commercial project and is not affiliated with Google. Contact:
    <a href="mailto:hello@freelyforms.com">hello@freelyforms.com</a>.
  </p>
`;
