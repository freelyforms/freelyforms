import type { FieldError } from "@freelyforms/form-engine";
import type { Field, Form } from "@freelyforms/form-schema";
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

const STYLE = `
:root{color-scheme:light dark;--fg:#1b1b1f;--muted:#5d5d66;--bg:#fff;--line:#c9c9d1;--accent:#1f5fd6;--err:#b3261e}
@media (prefers-color-scheme:dark){:root{--fg:#ececf1;--muted:#a5a5ae;--bg:#141417;--line:#3b3b43;--accent:#8ab0ff;--err:#ffb4ab}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:24px 16px 48px}h1{font-size:1.6rem;margin:0 0 8px}
.desc{color:var(--muted);margin:0 0 24px;white-space:pre-line}.field{margin:0 0 20px;border:0;padding:0}
label,legend{display:block;font-weight:600;margin-bottom:6px}.hint{color:var(--muted);font-size:.9rem;margin:-2px 0 6px}
input[type=text],input[type=email],input[type=tel],input[type=number],input[type=date],textarea,select{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;font:inherit}
textarea{min-height:120px}.choice{display:flex;gap:8px;align-items:flex-start;font-weight:400;margin:4px 0}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.error{color:var(--err);font-size:.9rem;margin-top:4px}button{background:var(--accent);color:var(--bg);border:0;border-radius:8px;padding:12px 20px;font:inherit;font-weight:600;cursor:pointer}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}.req{color:var(--err)}
`;

export interface PageOptions {
  /** CSP nonce for the inline style and scripts. */
  nonce: string;
  /** Turnstile site key; renders the challenge widget when set. */
  turnstileSiteKey?: string | undefined;
}

function page(title: string, body: Html, opts: PageOptions): Html {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>${title}</title>
        <style nonce="${opts.nonce}">
          ${raw(STYLE)}
        </style>
        ${
          opts.turnstileSiteKey
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
  return page(
    form.title,
    html`<h1>${form.title}</h1>
      ${form.description ? html`<p class="desc">${form.description}</p>` : ""}
      ${errors.size ? html`<p class="error" role="alert">Please correct the highlighted fields.</p>` : ""}
      ${state.notice ? html`<p class="error" role="alert">${state.notice}</p>` : ""}
      <form method="post" action="${action}" novalidate>
        ${form.fields.map((f) => fieldBlock(f, state.values?.[f.id], errors.get(f.id)))}
        ${opts.turnstileSiteKey ? html`<div class="field cf-turnstile" data-sitekey="${opts.turnstileSiteKey}"></div>` : ""}
        <div class="hp" aria-hidden="true">
          <label>Leave empty<input name="_hp" tabindex="-1" autocomplete="off" /></label>
        </div>
        <button type="submit">${form.settings?.submitLabel ?? "Submit"}</button>
      </form>`,
    opts,
  );
}

export function renderMessage(title: string, message: string, opts: PageOptions): Html {
  return page(
    title,
    html`<h1>${title}</h1>
      <p class="desc" role="status">${message}</p>`,
    opts,
  );
}
