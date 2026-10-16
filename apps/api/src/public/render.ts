import type { FieldError } from "@freelyforms/form-engine";
import type { Field, Form, FormTheme } from "@freelyforms/form-schema";
import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

const MESSAGES: Record<string, (p: Record<string, number | string>) => string> = {
  required: () => "This field is required.",
  invalid_type: () => "This value is not valid.",
  too_short: (p) => `Enter at least ${String(p.min)} characters.`,
  too_long: (p) => `Enter at most ${String(p.max)} characters.`,
  invalid_email: () => "Enter a valid email address.",
  invalid_phone: () => "Enter a valid phone number.",
  not_a_number: () => "Enter a number.",
  not_an_integer: () => "Enter a whole number.",
  too_small: (p) => `Enter ${String(p.min)} or more.`,
  too_large: (p) => `Enter ${String(p.max)} or less.`,
  invalid_date: () => "Enter a valid date.",
  invalid_option: () => "Choose one of the options.",
  too_few_selected: (p) => `Choose at least ${String(p.min)}.`,
  too_many_selected: (p) => `Choose at most ${String(p.max)}.`,
};

export const errorMessage = (e: FieldError) =>
  (MESSAGES[e.code] ?? MESSAGES.invalid_type)?.(e.params ?? {}) ?? "";

const LIGHT =
  "--fg:#1b1b1f;--muted:#5d5d66;--bg:#fff;--line:#c9c9d1;--accent:#1f5fd6;--on-accent:#fff;--err:#b3261e";
const DARK =
  "--fg:#ececf1;--muted:#a5a5ae;--bg:#141417;--line:#3b3b43;--accent:#8ab0ff;--on-accent:#141417;--err:#ffb4ab";

const BASE = `
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:24px 16px 32px}h1{font-size:1.6rem;margin:0 0 8px}
.desc{color:var(--muted);margin:0 0 24px;white-space:pre-line}.field{margin:0 0 20px;border:0;padding:0}
label,legend{display:block;font-weight:600;margin-bottom:6px}.hint{color:var(--muted);font-size:.9rem;margin:-2px 0 6px}
input[type=text],input[type=email],input[type=tel],input[type=number],input[type=date],textarea,select{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;font:inherit}
textarea{min-height:120px}.choice{display:flex;gap:8px;align-items:flex-start;font-weight:400;margin:4px 0}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.error{color:var(--err);font-size:.9rem;margin-top:4px}button{background:var(--accent);color:var(--on-accent);border:0;border-radius:8px;padding:12px 20px;font:inherit;font-weight:600;cursor:pointer}
button:disabled{opacity:.6;cursor:not-allowed}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}.req{color:var(--err)}
.preview{border:1px dashed var(--line);border-radius:8px;padding:8px 12px;color:var(--muted);font-size:.9rem;margin:0 0 20px}
footer{max-width:640px;margin:0 auto;padding:0 16px 24px;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:.8rem;color:var(--muted)}
footer a{color:inherit}
`;

/** Black or white text, whichever reads better on the accent colour (WCAG relative luminance). */
function onAccent(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) ? "#000" : "#fff";
}

/** Page CSS for a theme. The accent is a schema-validated `#rrggbb`, safe to inline. */
export function themeCss(theme: FormTheme | undefined): string {
  const scheme = theme?.colorScheme ?? "auto";
  const accent = theme?.accent
    ? `--accent:${theme.accent};--on-accent:${onAccent(theme.accent)}`
    : "";
  const root =
    scheme === "auto"
      ? `:root{color-scheme:light dark;${LIGHT};${accent}}@media (prefers-color-scheme:dark){:root{${DARK};${accent}}}`
      : `:root{color-scheme:${scheme};${scheme === "dark" ? DARK : LIGHT};${accent}}`;
  return root + BASE;
}

/**
 * When the form is embedded, tells the parent page its height so the embed script can size the
 * iframe, on load, on every resize and when the embed script asks (it may load after the form).
 * Height is not sensitive, so any parent may receive it.
 */
const EMBED_SCRIPT = `if(window.parent!==window){var p=function(){parent.postMessage({type:"freelyforms:height",height:Math.ceil(document.body.getBoundingClientRect().height)},"*")};new ResizeObserver(p).observe(document.body);addEventListener("message",function(e){if(e.source===parent&&e.data&&e.data.type==="freelyforms:ping")p()});p()}`;

export interface PageOptions {
  /** CSP nonce for the inline style and scripts. */
  nonce: string;
  /** Turnstile site key; renders the challenge widget when set. */
  turnstileSiteKey?: string | undefined;
  /** Address for abuse reports, shown in the footer of every form (ADR 0010). */
  abuseEmail?: string | undefined;
  /** Owner preview of a draft: shows a banner and disables submitting. */
  preview?: boolean;
}

function page(
  title: string,
  body: Html,
  opts: PageOptions,
  theme?: FormTheme,
  formId?: string,
): Html {
  const report =
    opts.abuseEmail && formId && !opts.preview
      ? html`<a
          href="mailto:${opts.abuseEmail}?subject=${encodeURIComponent(`Abuse report: ${formId}`)}"
          >Report abuse</a
        >`
      : "";
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>${title}</title>
        <style nonce="${opts.nonce}">
          ${raw(themeCss(theme))}
        </style>
        ${
          opts.turnstileSiteKey && !opts.preview
            ? html`<script
                nonce="${opts.nonce}"
                src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                async
                defer
              ></script>`
            : ""
        }
      </head>
      <body>
        <main>${body}</main>
        <footer>
          <span
            >Made with
            <a href="https://freelyforms.com" target="_blank" rel="noopener">Freely Forms</a>.
            Responses go to the form owner's Google Sheet.</span
          >
          ${report}
        </footer>
        <script nonce="${opts.nonce}">
          ${raw(EMBED_SCRIPT)};
        </script>
      </body>
    </html>`;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(str) : typeof v === "string" ? [v] : []);

function control(field: Field, value: unknown, describedBy: string | undefined): Html {
  const id = field.id;
  const req = field.required === true;
  const aria = describedBy ? raw(` aria-describedby="${describedBy}"`) : "";
  const invalid = describedBy?.includes("err") ? raw(' aria-invalid="true"') : "";
  switch (field.type) {
    case "text":
    case "email":
    case "phone":
    case "number":
    case "date": {
      const type = { text: "text", email: "email", phone: "tel", number: "number", date: "date" }[
        field.type
      ];
      const extra =
        field.type === "number"
          ? html`${field.min !== undefined ? html` min="${field.min}"` : ""}${field.max !== undefined ? html` max="${field.max}"` : ""}
            step="${field.integer === true ? "1" : "any"}"`
          : field.type === "date"
            ? html`${field.min ? html` min="${field.min}"` : ""}${field.max ? html` max="${field.max}"` : ""}`
            : "";
      const placeholder =
        "placeholder" in field && field.placeholder
          ? html` placeholder="${field.placeholder}"`
          : "";
      return html`<input
        id="${id}"
        name="${id}"
        type="${type}"
        value="${str(value)}"
        ${req ? raw(" required") : ""}${placeholder}${extra}${aria}${invalid}
      />`;
    }
    case "textarea":
      return html`<textarea id="${id}" name="${id}" ${req ? raw(" required") : ""}${aria}${invalid}>
${str(value)}</textarea>`;
    case "select":
      return html`<select id="${id}" name="${id}" ${req ? raw(" required") : ""}${aria}${invalid}>
        <option value="">Choose…</option>
        ${field.options.map((o) => html`<option value="${o.id}" ${str(value) === o.id ? raw(" selected") : ""}>${o.label}</option>`)}
      </select>`;
    case "multiselect":
      return html`<select id="${id}" name="${id}" multiple${aria}${invalid}>
        ${field.options.map((o) => html`<option value="${o.id}" ${list(value).includes(o.id) ? raw(" selected") : ""}>${o.label}</option>`)}
      </select>`;
    case "radio":
    case "checkboxes": {
      const type = field.type === "radio" ? "radio" : "checkbox";
      const chosen = list(value);
      return html`${field.options.map(
        (o) =>
          html`<label class="choice"
            ><input
              type="${type}"
              name="${id}"
              value="${o.id}"
              ${chosen.includes(o.id) ? raw(" checked") : ""}${type === "radio" && req ? raw(" required") : ""}
            />${o.label}</label
          >`,
      )}`;
    }
    case "consent":
      return html`<label class="choice"
        ><input
          type="checkbox"
          name="${id}"
          value="on"
          ${value === "on" || value === true ? raw(" checked") : ""}${req ? raw(" required") : ""}${aria}
        />${field.label}${req ? html` <span class="req" aria-hidden="true">*</span>` : ""}</label
      >`;
  }
}

function fieldBlock(field: Field, value: unknown, error: FieldError | undefined): Html {
  const hintId = field.description ? `${field.id}_hint` : undefined;
  const errId = error ? `${field.id}_err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  const hint = field.description
    ? html`<p class="hint" id="${hintId}">${field.description}</p>`
    : "";
  const err = error ? html`<p class="error" id="${errId}">${errorMessage(error)}</p>` : "";
  const star = field.required === true ? html` <span class="req" aria-hidden="true">*</span>` : "";
  if (field.type === "radio" || field.type === "checkboxes") {
    return html`<fieldset
      class="field"
      ${describedBy ? raw(` aria-describedby="${describedBy}"`) : ""}
    >
      <legend>${field.label}${star}</legend>
      ${hint}${control(field, value, undefined)}${err}
    </fieldset>`;
  }
  if (field.type === "consent") {
    return html`<div class="field">${hint}${control(field, value, describedBy)}${err}</div>`;
  }
  return html`<div class="field">
    <label for="${field.id}">${field.label}${star}</label
    >${hint}${control(field, value, describedBy)}${err}
  </div>`;
}

export function renderForm(
  form: Form,
  action: string,
  opts: PageOptions,
  state: { values?: Record<string, unknown>; errors?: readonly FieldError[]; notice?: string } = {},
): Html {
  const errors = new Map((state.errors ?? []).map((e) => [e.fieldId, e]));
  const turnstile = opts.turnstileSiteKey && !opts.preview ? opts.turnstileSiteKey : undefined;
  return page(
    form.title,
    html`${opts.preview ? html`<p class="preview" role="note">Preview of your draft. Responses are not sent.</p>` : ""}
      <h1>${form.title}</h1>
      ${form.description ? html`<p class="desc">${form.description}</p>` : ""}
      ${errors.size ? html`<p class="error" role="alert">Please correct the highlighted fields.</p>` : ""}
      ${state.notice ? html`<p class="error" role="alert">${state.notice}</p>` : ""}
      <form method="post" action="${action}" novalidate>
        ${form.fields.map((f) => fieldBlock(f, state.values?.[f.id], errors.get(f.id)))}
        ${turnstile ? html`<div class="field cf-turnstile" data-sitekey="${turnstile}"></div>` : ""}
        <div class="hp" aria-hidden="true">
          <label>Leave empty<input name="_hp" tabindex="-1" autocomplete="off" /></label>
        </div>
        <button type="submit" ${opts.preview ? raw("disabled") : ""}>
          ${form.settings?.submitLabel ?? "Submit"}
        </button>
      </form>`,
    opts,
    form.settings?.theme,
    form.id,
  );
}

export function renderMessage(
  title: string,
  message: string,
  opts: PageOptions,
  form?: Pick<Form, "id" | "settings">,
): Html {
  return page(
    title,
    html`<h1>${title}</h1>
      <p class="desc" role="status">${message}</p>`,
    opts,
    form?.settings?.theme,
    form?.id,
  );
}
