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

  const sections = [...form.querySelectorAll<HTMLElement>(":scope > section.page")];
  const paged = sections.length > 1;
  const pageOf = (id: string) => sections.findIndex((s) => s.contains(container(id)));
  let shown: ReadonlySet<string> = new Set(schema.fields.map((f) => f.id));

  /**
   * Shows the fields whose conditions hold and hides the others (ADR 0017); fields on a page that
   * is skipped count as not shown (ADR 0018). Inputs of fields that are not shown are disabled, so
   * they are neither checked nor sent; the server applies the same rules.
   */
  const dynamic = schema.fields.some((f) => f.showIf);
  const applyVisibility = () => {
    if (!dynamic) return;
    shown = visibleFields(schema, answersOf(form));
    for (const field of schema.fields) {
      if (field.type === "page") continue;
      const visible = shown.has(field.id);
      const box = container(field.id);
      if (box) box.hidden = !visible;
      const controls = box
        ? box.querySelectorAll<HTMLInputElement>("input, select, textarea")
        : form.querySelectorAll<HTMLInputElement>(`[name="${CSS.escape(field.id)}"]`);
      for (const control of controls) control.disabled = !visible;
      if (!visible) show(field.id, undefined);
    }
    renderPage();
  };

  // One page at a time, with Back and Next (ADR 0018). Without this script every page shows.
  let step = 0;
  const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
  const progress = document.createElement("p");
  const back = document.createElement("button");
  const next = document.createElement("button");
  const pagesInUse = () => sections.filter((s) => !s.dataset.field || shown.has(s.dataset.field));
  function renderPage() {
    if (!paged) return;
    const active = pagesInUse();
    step = Math.min(step, active.length - 1);
    const current = active[step];
    for (const section of sections) section.hidden = section !== current;
    const last = step === active.length - 1;
    progress.textContent = `Page ${String(step + 1)} of ${String(active.length)}`;
    back.hidden = step === 0;
    next.hidden = last;
    if (submit) submit.hidden = !last;
  }
  const goTo = (index: number) => {
    step = Math.max(0, index);
    renderPage();
    const current = pagesInUse()[step];
    const title = current?.querySelector<HTMLElement>(".page-title");
    if (form.getBoundingClientRect().top < 0) form.scrollIntoView({ block: "start" });
    (title ?? current?.querySelector<HTMLElement>("input, select, textarea"))?.focus();
  };

  const focusField = (id: string) => {
    const box = container(id);
    const control =
      box?.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ??
      box?.querySelector<HTMLElement>(`[name="${CSS.escape(id)}"]`);
    control?.focus();
  };

  /** Checks the fields on the current page only; true when it can be left. */
  const checkPage = () => {
    attempted = true;
    const current = pagesInUse()[step];
    const errors = errorsFor(schema.fields);
    const here = schema.fields.filter(
      (f) => f.type !== "page" && current?.contains(container(f.id)),
    );
    for (const field of here) show(field.id, errors.get(field.id));
    const first = here.find((f) => errors.has(f.id));
    summary(first !== undefined);
    if (first) focusField(first.id);
    return first === undefined;
  };

  if (paged) {
    progress.className = "progress";
    progress.setAttribute("aria-live", "polite");
    form.prepend(progress);
    const bar = document.createElement("div");
    bar.className = "pager";
    back.type = "button";
    back.className = "back";
    back.textContent = "Back";
    next.type = "button";
    next.textContent = "Next";
    back.addEventListener("click", () => {
      summary(false);
      goTo(step - 1);
    });
    next.addEventListener("click", () => {
      if (checkPage()) goTo(step + 1);
    });
    submit?.before(bar);
    bar.append(back, next);
    if (submit) bar.append(submit);
  }
  applyVisibility();
  renderPage();

  form.addEventListener("submit", (event) => {
    attempted = true;
    // Enter in a field on an earlier page means Next, not Submit.
    if (paged && step < pagesInUse().length - 1) {
      event.preventDefault();
      if (checkPage()) goTo(step + 1);
      return;
    }
    const errors = errorsFor(schema.fields);
    for (const field of schema.fields) show(field.id, errors.get(field.id));
    const first = schema.fields.find((f) => errors.has(f.id));
    if (first) {
      event.preventDefault();
      summary(true);
      if (paged) {
        const page = pagesInUse().indexOf(sections[pageOf(first.id)] as HTMLElement);
        if (page >= 0 && page !== step) {
          step = page;
          renderPage();
        }
      }
      focusField(first.id);
      return;
    }
    summary(false);
    if (submit) {
      // Stops a second click from sending the answers twice while the page is loading.
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
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
