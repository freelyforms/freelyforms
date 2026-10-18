/**
 * Browser script of the public form page: checks answers with the same validator and messages as
 * the server before the form is sent, so a mistake doesn't cost a page load and a new Turnstile
 * challenge. The server still validates everything; without this script the form works as before.
 *
 * Bundled into ../client.generated.ts by scripts/build-form-client.ts (`pnpm build:client`).
 */
import { validateSubmission, visibleFields, type FieldError } from "@freelyforms/form-engine";
import type { Form } from "@freelyforms/form-schema";
import { errorMessage } from "../messages.js";

type Fields = Pick<Form, "fields">;

const SUMMARY_ID = "ff-summary";
const SUMMARY_TEXT = "Please correct the highlighted fields.";

/** Answers as the server reads them: one string, or a list when a name repeats. */
function answersOf(form: HTMLFormElement): Record<string, unknown> {
  const data = new FormData(form);
  const answers: Record<string, unknown> = {};
  for (const key of new Set(data.keys())) {
    const values = data.getAll(key).filter((v): v is string => typeof v === "string");
    answers[key] = values.length === 1 ? values[0] : values;
  }
  return answers;
}

function setup(form: HTMLFormElement, schema: Fields) {
  let attempted = false;

  const container = (id: string) =>
    form.querySelector<HTMLElement>(`[data-field="${CSS.escape(id)}"]`);

  /** Shows or clears one field's error, with the same markup the server renders. */
  const show = (id: string, error: FieldError | undefined) => {
    const box = container(id);
    if (!box) return;
    const errId = `${id}_err`;
    let message = box.querySelector<HTMLElement>(`#${CSS.escape(errId)}`);
    if (error) {
      if (!message) {
        message = document.createElement("p");
        message.className = "error";
        message.id = errId;
        box.append(message);
      }
      message.textContent = errorMessage(error);
    } else {
      message?.remove();
    }
    const hint = box.querySelector(".hint")?.id;
    const describedBy = [hint, error ? errId : undefined].filter(Boolean).join(" ");
    // Groups describe the fieldset; single controls describe themselves (as on the server).
    const target =
      box.tagName === "FIELDSET"
        ? box
        : box.querySelector<HTMLElement>(`[name="${CSS.escape(id)}"]`);
    if (!target) return;
    if (describedBy) target.setAttribute("aria-describedby", describedBy);
    else target.removeAttribute("aria-describedby");
    if (target.id === id) {
      if (error) target.setAttribute("aria-invalid", "true");
      else target.removeAttribute("aria-invalid");
    }
  };

  const summary = (visible: boolean) => {
    let el = document.getElementById(SUMMARY_ID);
    if (!visible) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("p");
      el.className = "error";
      el.id = SUMMARY_ID;
      el.setAttribute("role", "alert");
      el.textContent = SUMMARY_TEXT;
      form.before(el);
    }
  };

  const errorsFor = (fields: Fields["fields"]) => {
    const result = validateSubmission({ fields }, answersOf(form));
    return new Map(result.ok ? [] : result.errors.map((e) => [e.fieldId, e]));
  };

  // A field's check can depend on the answers above it (conditions), so the whole form is checked.
  const recheck = (id: string) => {
    if (!schema.fields.some((f) => f.id === id)) return;
    show(id, errorsFor(schema.fields).get(id));
    if (!form.querySelector(".error")) summary(false);
  };

  /**
   * Shows the fields whose conditions hold and hides the others (ADR 0017). Inputs of hidden
   * fields are disabled, so they are neither checked nor sent; the server applies the same rules.
   */
  const conditional = schema.fields.filter((f) => f.showIf);
  const applyVisibility = () => {
    if (!conditional.length) return;
    const shown = visibleFields(schema, answersOf(form));
    for (const field of conditional) {
      const visible = shown.has(field.id);
      const box = container(field.id);
      if (box) box.hidden = !visible;
      const controls = box
        ? box.querySelectorAll<HTMLInputElement>("input, select, textarea")
        : form.querySelectorAll<HTMLInputElement>(`[name="${CSS.escape(field.id)}"]`);
      for (const control of controls) control.disabled = !visible;
      if (!visible) show(field.id, undefined);
    }
  };
  applyVisibility();

  form.addEventListener("submit", (event) => {
    attempted = true;
    const errors = errorsFor(schema.fields);
    for (const field of schema.fields) show(field.id, errors.get(field.id));
    const first = schema.fields.find((f) => errors.has(f.id));
    if (first) {
      event.preventDefault();
      summary(true);
      const box = container(first.id);
      const control =
        box?.querySelector<HTMLElement>(`#${CSS.escape(first.id)}`) ??
        box?.querySelector<HTMLElement>(`[name="${CSS.escape(first.id)}"]`);
      control?.focus();
      return;
    }
    summary(false);
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button) {
      // Stops a second click from sending the answers twice while the page is loading.
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
  });

  // While typing, only a field that already shows an error is rechecked (so it clears as soon as
  // it's fixed); after a submit attempt, leaving any field rechecks it.
  form.addEventListener("input", (event) => {
    applyVisibility();
    const name = (event.target as HTMLInputElement | null)?.name;
    if (name && document.getElementById(`${name}_err`)) recheck(name);
  });
  form.addEventListener("change", (event) => {
    applyVisibility();
    const name = (event.target as HTMLInputElement | null)?.name;
    if (name && attempted) recheck(name);
  });

  // Coming back with the browser's Back button restores the page as it was: enable the button.
  addEventListener("pageshow", () => {
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button && button.getAttribute("aria-busy") === "true") {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  });
}

/**
 * In an embed, hidden fields the form link didn't fill ask the host page for their parameters
 * (e.g. utm_source from the page's address). The embed script answers with only the names asked
 * for; nothing is sent anywhere until the respondent submits.
 */
function askHostForParams() {
  if (window.parent === window) return;
  const empty = [
    ...document.querySelectorAll<HTMLInputElement>("input[type=hidden][data-param]"),
  ].filter((input) => input.value === "");
  if (!empty.length) return;
  const names = [...new Set(empty.map((input) => input.dataset.param ?? ""))];
  const ask = () => {
    parent.postMessage({ type: "freelyforms:params", names }, "*");
  };
  addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== parent || typeof event.data !== "object" || event.data === null) return;
    const data = event.data as { type?: unknown; values?: unknown };
    if (data.type === "freelyforms:ping") ask();
    if (data.type !== "freelyforms:param-values" || typeof data.values !== "object") return;
    const values = (data.values ?? {}) as Record<string, unknown>;
    for (const input of empty) {
      const value = values[input.dataset.param ?? ""];
      if (typeof value === "string" && input.value === "") input.value = value;
    }
    // Conditions may depend on these values.
    empty[0]?.form?.dispatchEvent(new Event("change"));
  });
  ask();
}

askHostForParams();

const form = document.querySelector<HTMLFormElement>("form[data-ff]");
const data = document.getElementById("ff-fields");
if (form && data?.textContent) setup(form, JSON.parse(data.textContent) as Fields);
