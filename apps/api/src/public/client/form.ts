/**
 * Browser script of the public form page: checks answers with the same validator and messages as
 * the server before the form is sent, so a mistake doesn't cost a page load and a new Turnstile
 * challenge. The server still validates everything; without this script the form works as before.
 *
 * Bundled into ../client.generated.ts by scripts/build-form-client.ts (`pnpm build:client`).
 */
import { formState, validateSubmission, type FieldError } from "@freelyforms/form-engine";
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
  // One question at a time when the owner chose the conversational mode; otherwise one page at a
  // time when there are page breaks (ADR 0018). Without this script everything shows at once.
  const conversational = form.dataset.mode === "conversational";
  const paged = conversational || sections.length > 1;
  let shown: ReadonlySet<string> = new Set(schema.fields.map((f) => f.id));

  /**
   * Shows the fields whose conditions hold and hides the others (ADR 0017); fields on a page that
   * is skipped count as not shown (ADR 0018). Inputs of fields that are not shown are disabled, so
   * they are neither checked nor sent; the server applies the same rules.
   */
  const dynamic = schema.fields.some(
    (f) => f.showIf || ("requiredIf" in f && f.requiredIf) || f.type === "calculation",
  );
  const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });
  const applyVisibility = () => {
    if (!dynamic) return;
    const answers = answersOf(form);
    const state = formState(schema, answers);
    shown = state.shown;
    // Shown calculations display the running result; the server computes the one that counts.
    for (const output of form.querySelectorAll<HTMLOutputElement>("output[data-calc]")) {
      const id = output.closest<HTMLElement>("[data-field]")?.dataset.field ?? "";
      const value = state.values[id];
      output.value = typeof value === "number" ? numberFormat.format(value) : "–";
    }
    // Fields required only under conditions show the marker while those hold (ADR 0019).
    const required = state.required;
    for (const field of schema.fields) {
      if (!("requiredIf" in field) || !field.requiredIf) continue;
      const box = container(field.id);
      const on = required.has(field.id);
      const star = box?.querySelector<HTMLElement>("[data-req-if]");
      if (star) star.hidden = !on;
      const target =
        box?.tagName === "FIELDSET"
          ? box
          : box?.querySelector<HTMLElement>(`[name="${CSS.escape(field.id)}"]`);
      if (on) target?.setAttribute("aria-required", "true");
      else target?.removeAttribute("aria-required");
    }
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

  let step = 0;
  const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
  const progress = document.createElement("p");
  const back = document.createElement("button");
  const next = document.createElement("button");
  const pagesInUse = () => sections.filter((s) => !s.dataset.field || shown.has(s.dataset.field));

  /** What one step shows: a page, or in the conversational mode one question on its page. */
  interface Step {
    section: HTMLElement;
    field?: HTMLElement;
  }
  const steps = (): Step[] =>
    conversational
      ? pagesInUse().flatMap((section) =>
          [...section.querySelectorAll<HTMLElement>(":scope > [data-field]")]
            .filter((field) => !field.hidden)
            .map((field) => ({ section, field })),
        )
      : pagesInUse().map((section) => ({ section }));
  const stepOf = (id: string) =>
    steps().findIndex((s) => (s.field ?? s.section).contains(container(id)));

  function renderPage() {
    if (!paged) return;
    const all = steps();
    step = Math.max(0, Math.min(step, all.length - 1));
    const current = all[step];
    for (const section of sections) section.hidden = section !== current?.section;
    if (conversational && current) {
      // A page's title shows with its first question only.
      const first = all.find((s) => s.section === current.section)?.field;
      for (const el of current.section.querySelectorAll<HTMLElement>(":scope > *")) {
        const isTitle = !el.dataset.field;
        el.classList.toggle("step-off", isTitle ? current.field !== first : el !== current.field);
      }
    }
    const last = step >= all.length - 1;
    progress.textContent = `${conversational ? "Question" : "Page"} ${String(step + 1)} of ${String(all.length)}`;
    back.hidden = step === 0;
    next.hidden = last;
    if (submit) submit.hidden = !last;
  }
  const goTo = (index: number) => {
    step = Math.max(0, index);
    renderPage();
    const current = steps()[step];
    const title = conversational
      ? null
      : current?.section.querySelector<HTMLElement>(".page-title");
    if (form.getBoundingClientRect().top < 0) form.scrollIntoView({ block: "start" });
    (
      title ??
      (current?.field ?? current?.section)?.querySelector<HTMLElement>("input, select, textarea")
    )?.focus();
  };

  const focusField = (id: string) => {
    const box = container(id);
    const control =
      box?.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ??
      box?.querySelector<HTMLElement>(`[name="${CSS.escape(id)}"]`);
    control?.focus();
  };

  /** Checks the fields of the current step only; true when it can be left. */
  const checkPage = () => {
    attempted = true;
    const current = steps()[step];
    const scope = current?.field ?? current?.section;
    const errors = errorsFor(schema.fields);
    const here = schema.fields.filter((f) => f.type !== "page" && scope?.contains(container(f.id)));
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
    // Enter in a field before the last step means Next, not Submit.
    if (paged && step < steps().length - 1) {
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
        const at = stepOf(first.id);
        if (at >= 0 && at !== step) {
          step = at;
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
