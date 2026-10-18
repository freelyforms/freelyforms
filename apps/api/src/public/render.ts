import type { FieldError } from "@freelyforms/form-engine";
import type { Field, Form, FormTheme } from "@freelyforms/form-schema";
import {
  DEFAULT_RATING_MAX,
  DEFAULT_SCALE_MAX,
  DEFAULT_SCALE_MIN,
} from "@freelyforms/form-schema/limits";
import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { FORM_CLIENT_JS } from "./client.generated.js";
import { errorMessage } from "./messages.js";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

const LIGHT =
  "--fg:#1b1b1f;--muted:#5d5d66;--bg:#fff;--line:#b9b9c3;--accent:#1f5fd6;--on-accent:#fff;--err:#b3261e";
const DARK =
  "--fg:#ececf1;--muted:#a5a5ae;--bg:#141417;--line:#55555f;--accent:#8ab0ff;--on-accent:#141417;--err:#ffb4ab";

const BASE = `
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 var(--font)}[hidden]{display:none!important}
main{max-width:620px;margin:0 auto;padding:40px 20px 24px}h1{font-size:1.75rem;line-height:1.25;margin:0 0 8px}
.desc{color:var(--muted);margin:0 0 32px;white-space:pre-line}h1+form{margin-top:32px}.field{margin:0 0 var(--gap);border:0;padding:0;min-width:0}
label,legend{display:block;font-weight:600;margin-bottom:8px}.hint{color:var(--muted);font-size:.9rem;margin:-4px 0 8px}
input[type=text],input[type=email],input[type=tel],input[type=number],input[type=date],textarea,select{width:100%;padding:var(--pad);border:1px solid var(--line);border-radius:var(--radius);background:transparent;color:inherit;font:inherit}
textarea{min-height:120px}.choice{display:flex;gap:8px;align-items:flex-start;font-weight:400;margin:6px 0}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
[aria-invalid=true]{border-color:var(--err)!important}
.error{color:var(--err);font-size:.9rem;margin-top:6px}button{min-width:120px;background:var(--accent);color:var(--on-accent);border:0;border-radius:var(--button-radius);padding:12px 24px;font:inherit;font-weight:600;cursor:pointer}
button:disabled{opacity:.6;cursor:not-allowed}.is-preview button:disabled{opacity:1;cursor:default}
.cf-turnstile{margin:32px 0 24px}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}.req{color:var(--err)}
.page-title{font-size:1.3rem;line-height:1.3;margin:8px 0 12px}.page-title:focus{outline:none}
.progress{color:var(--muted);font-size:.9rem;margin:0 0 16px}.pager{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}
.pager .back{background:transparent;color:var(--fg);border:1px solid var(--line)}
.page{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:16px}.page>*{grid-column:1/-1}
.page>.half{grid-column:auto}
.sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;padding:0}
.rating{display:flex;gap:4px}.rating label{font-size:2rem;line-height:1;color:var(--line);cursor:pointer;margin:0;padding:2px;border-radius:6px}
.rating label:has(input:checked),.rating label:has(~ label input:checked){color:var(--accent)}
.rating label:has(input:focus-visible),.scale label:has(input:focus-visible){outline:3px solid var(--accent);outline-offset:2px}
.scale{display:inline-flex;flex-direction:column;max-width:100%}.scale-options{display:flex;gap:6px;flex-wrap:wrap}.scale-options label{margin:0;font-weight:600;cursor:pointer}
.scale-options span{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:44px;padding:0 8px;border:1px solid var(--line);border-radius:var(--radius)}
.scale-options label:has(input:checked) span{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.scale-ends{display:flex;justify-content:space-between;color:var(--muted);font-size:.85rem;margin-top:6px}.step-off{display:none!important}
form[data-mode=conversational] .field>label,form[data-mode=conversational] .field>legend{font-size:1.3rem;line-height:1.35;margin-bottom:12px}
form[data-mode=conversational] .page>.half{grid-column:1/-1}@media (max-width:560px){.page>.half{grid-column:1/-1}}
footer{max-width:620px;margin:0 auto;padding:16px 20px 32px;font-size:.8rem;color:var(--muted)}
footer p{margin:0 0 4px}footer a{color:inherit}
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

const FONTS = {
  system: "system-ui,sans-serif",
  serif: 'ui-serif,Georgia,Cambria,"Times New Roman",serif',
  rounded: 'ui-rounded,"SF Pro Rounded","Nunito","Varela Round",system-ui,sans-serif',
  mono: 'ui-monospace,"SF Mono",Menlo,Consolas,monospace',
} as const;
const CORNERS = {
  square: { field: "2px", button: "2px" },
  rounded: { field: "8px", button: "8px" },
  pill: { field: "14px", button: "999px" },
} as const;

/**
 * Page CSS for a theme. Every value comes from a schema enum or a validated `#rrggbb`, so it is
 * safe to inline.
 */
export function themeCss(theme: FormTheme | undefined): string {
  const scheme = theme?.colorScheme ?? "auto";
  const corners = CORNERS[theme?.corners ?? "rounded"];
  const compact = theme?.density === "compact";
  const shape = `--font:${FONTS[theme?.font ?? "system"]};--radius:${corners.field};--button-radius:${corners.button};--gap:${compact ? "14px" : "24px"};--pad:${compact ? "7px 10px" : "11px 12px"}`;
  const accent = theme?.accent
    ? `--accent:${theme.accent};--on-accent:${onAccent(theme.accent)};${shape}`
    : shape;
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
  /** The service's privacy policy, linked from every form. */
  privacyUrl?: string | undefined;
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
      <body class="${opts.preview ? "is-preview" : ""}">
        <main>${body}</main>
        <footer>
          <p>
            Made with
            <a href="https://freelyforms.com" target="_blank" rel="noopener">Freely Forms</a> ·
            answers go to the form owner's Google Sheet
          </p>
          <p>
            ${opts.privacyUrl ? html`<a href="${opts.privacyUrl}" target="_blank" rel="noopener">Privacy</a>` : ""}
            ${opts.privacyUrl && report ? " · " : ""}${report}
          </p>
        </footer>
        <script nonce="${opts.nonce}">
          ${raw(EMBED_SCRIPT)};
        </script>
      </body>
    </html>`;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(str) : typeof v === "string" ? [v] : []);

type AnswerField = Exclude<Field, { type: "page" }>;

/**
 * The required marker. A field required only under conditions (ADR 0019) gets a hidden one that
 * the form script shows while they hold.
 */
function starFor(field: AnswerField): Html | "" {
  if (field.required === true) return html` <span class="req" aria-hidden="true">*</span>`;
  if (field.requiredIf)
    return html` <span class="req" aria-hidden="true" data-req-if hidden>*</span>`;
  return "";
}

function control(field: AnswerField, value: unknown, describedBy: string | undefined): Html {
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
            : field.type === "text" && field.match?.kind === "digits"
              ? raw(' inputmode="numeric"')
              : field.type === "text" && field.match?.kind === "url"
                ? raw(' inputmode="url"')
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
    case "hidden":
      return html`<input
        type="hidden"
        name="${id}"
        value="${str(value)}"
        data-param="${field.param ?? id}"
      />`;
    case "rating": {
      const max = field.max ?? DEFAULT_RATING_MAX;
      return html`<div class="rating">
        ${Array.from({ length: max }, (_, i) => i + 1).map(
          (n) =>
            html`<label
              ><input
                type="radio"
                class="sr"
                name="${id}"
                value="${n}"
                ${str(value) === String(n) || value === n ? raw(" checked") : ""}${req && n === 1 ? raw(" required") : ""}
              /><span aria-hidden="true">★</span><span class="sr">${n} of ${max}</span></label
            >`,
        )}
      </div>`;
    }
    case "scale": {
      const min = field.min ?? DEFAULT_SCALE_MIN;
      const max = field.max ?? DEFAULT_SCALE_MAX;
      return html`<div class="scale">
        <div class="scale-options">
          ${Array.from({ length: max - min + 1 }, (_, i) => min + i).map(
            (n) =>
              html`<label
                ><input
                  type="radio"
                  class="sr"
                  name="${id}"
                  value="${n}"
                  ${str(value) === String(n) || value === n ? raw(" checked") : ""}${req && n === min ? raw(" required") : ""}
                /><span>${n}</span></label
              >`,
          )}
        </div>
        ${
          field.minLabel || field.maxLabel
            ? html`<div class="scale-ends" aria-hidden="true">
                <span>${field.minLabel ?? ""}</span><span>${field.maxLabel ?? ""}</span>
              </div>`
            : ""
        }
      </div>`;
    }
    case "consent":
      return html`<label class="choice"
        ><input
          type="checkbox"
          name="${id}"
          value="on"
          ${value === "on" || value === true ? raw(" checked") : ""}${req ? raw(" required") : ""}${aria}
        />${field.label}${starFor(field)}</label
      >`;
  }
}

/** The scale's end labels for screen readers (they are shown visually under the buttons). */
function scaleEnds(field: AnswerField): Html | "" {
  if (field.type !== "scale" || (!field.minLabel && !field.maxLabel)) return "";
  const min = `${String(field.min ?? DEFAULT_SCALE_MIN)}${field.minLabel ? ` = ${field.minLabel}` : ""}`;
  const max = `${String(field.max ?? DEFAULT_SCALE_MAX)}${field.maxLabel ? ` = ${field.maxLabel}` : ""}`;
  return html`<span class="sr"> (${min}, ${max})</span>`;
}

const fieldClass = (field: AnswerField) => (field.width === "half" ? "field half" : "field");

function fieldBlock(field: AnswerField, value: unknown, error: FieldError | undefined): Html {
  if (field.type === "hidden") return control(field, value, undefined);
  const hintId = field.description ? `${field.id}_hint` : undefined;
  const errId = error ? `${field.id}_err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  const hint = field.description
    ? html`<p class="hint" id="${hintId}">${field.description}</p>`
    : "";
  const err = error ? html`<p class="error" id="${errId}">${errorMessage(error)}</p>` : "";
  const star = starFor(field);
  if (
    field.type === "radio" ||
    field.type === "checkboxes" ||
    field.type === "rating" ||
    field.type === "scale"
  ) {
    return html`<fieldset
      class="${fieldClass(field)}"
      data-field="${field.id}"
      ${describedBy ? raw(` aria-describedby="${describedBy}"`) : ""}
    >
      <legend>${field.label}${star}${scaleEnds(field)}</legend>
      ${hint}${control(field, value, undefined)}${err}
    </fieldset>`;
  }
  if (field.type === "consent") {
    return html`<div class="${fieldClass(field)}" data-field="${field.id}">
      ${hint}${control(field, value, describedBy)}${err}
    </div>`;
  }
  return html`<div class="${fieldClass(field)}" data-field="${field.id}">
    <label for="${field.id}">${field.label}${star}</label
    >${hint}${control(field, value, describedBy)}${err}
  </div>`;
}

/**
 * The fields as data for the browser check, and the bundled check itself. `<` is escaped so a
 * label can't close the data block.
 */
function clientScript(form: Form, nonce: string): Html {
  const fields = JSON.stringify({ fields: form.fields }).replace(/</g, "\\u003c");
  return html`<script type="application/json" id="ff-fields">
      ${raw(fields)}
    </script>
    <script nonce="${nonce}">
      ${raw(FORM_CLIENT_JS)};
    </script>`;
}

/** The form split at its page breaks (ADR 0018); the first page has no break of its own. */
function pages(form: Form) {
  const out: { breakField?: Extract<Field, { type: "page" }>; fields: AnswerField[] }[] = [
    { fields: [] },
  ];
  for (const field of form.fields) {
    if (field.type === "page") out.push({ breakField: field, fields: [] });
    else out.at(-1)?.fields.push(field);
  }
  return out;
}

export function renderForm(
  form: Form,
  action: string,
  opts: PageOptions,
  state: { values?: Record<string, unknown>; errors?: readonly FieldError[]; notice?: string } = {},
): Html {
  const errors = new Map((state.errors ?? []).map((e) => [e.fieldId, e]));
  const turnstile = opts.turnstileSiteKey && !opts.preview ? opts.turnstileSiteKey : undefined;
  // Multi-page forms keep the check out of sight unless it needs the respondent (ADR 0018).
  const appearance =
    form.settings?.mode === "conversational" || form.fields.some((f) => f.type === "page")
      ? raw(' data-appearance="interaction-only"')
      : "";
  return page(
    form.title,
    html`<h1>${form.title}</h1>
      ${form.description ? html`<p class="desc">${form.description}</p>` : ""}
      ${
        errors.size
          ? html`<p class="error" role="alert" id="ff-summary">
              Please correct the highlighted fields.
            </p>`
          : ""
      }
      ${state.notice ? html`<p class="error" role="alert">${state.notice}</p>` : ""}
      <form
        method="post"
        action="${action}"
        novalidate
        data-ff
        ${form.settings?.mode === "conversational" ? raw(' data-mode="conversational"') : ""}
      >
        ${pages(form).map(
          (p) =>
            html`<section
              class="page"
              ${p.breakField ? raw(` data-field="${p.breakField.id}" aria-labelledby="${p.breakField.id}_title"`) : ""}
            >
              ${
                p.breakField
                  ? html`<h2 class="page-title" id="${p.breakField.id}_title" tabindex="-1">
                        ${p.breakField.label}
                      </h2>
                      ${
                        p.breakField.description
                          ? html`<p class="desc">${p.breakField.description}</p>`
                          : ""
                      }`
                  : ""
              }
              ${p.fields.map((f) => fieldBlock(f, state.values?.[f.id], errors.get(f.id)))}
            </section>`,
        )}
        ${
          turnstile
            ? html`<div class="field cf-turnstile" data-sitekey="${turnstile}" ${appearance}></div>`
            : ""
        }
        <div class="hp" aria-hidden="true">
          <label>Leave empty<input name="_hp" tabindex="-1" autocomplete="off" /></label>
        </div>
        <button type="submit" ${opts.preview ? raw("disabled") : ""}>
          ${form.settings?.submitLabel ?? "Submit"}
        </button>
      </form>
      ${clientScript(form, opts.nonce)}`,
    opts,
    form.settings?.theme,
    form.id,
  );
}

/**
 * After a submission with a redirect: a standalone form goes straight to the owner's page; an
 * embedded one asks the embed script to take the whole host page there. Without either, the
 * respondent follows the link.
 */
export function renderRedirect(
  form: Pick<Form, "id" | "title" | "settings">,
  url: string,
  opts: PageOptions,
): Html {
  const target = JSON.stringify(url).replace(/</g, "\\u003c");
  const go = `(function(u){if(window.parent===window)location.replace(u);else parent.postMessage({type:"freelyforms:redirect",url:u},"*")})(${target})`;
  return page(
    form.title,
    html`<h1>${form.title}</h1>
      <p class="desc" role="status">Thanks — your response was received.</p>
      <p><a href="${url}" target="_top">Continue</a></p>
      <script nonce="${opts.nonce}">
        ${raw(go)};
      </script>`,
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
