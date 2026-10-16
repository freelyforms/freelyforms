/**
 * Pure edits of a form draft. Every function returns a new form and never mutates its input, so
 * React state updates stay simple and the logic is testable without a browser.
 */
import type { Field, FieldOption, Form, FormSettings } from "@freelyforms/form-schema";
import { MAX_FIELDS, MAX_OPTIONS, type FieldType } from "@freelyforms/form-schema/limits";

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Random lowercase suffix for field and option IDs (IDs never change once published). */
export function randomSuffix(length = 8, random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ID_ALPHABET.charAt(Math.floor(random() * 36));
  return out;
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  email: "Email",
  phone: "Phone",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  radio: "Single choice",
  checkboxes: "Checkboxes",
  multiselect: "Multi-select list",
  consent: "Consent checkbox",
};

export const hasOptions = (field: Field): field is Extract<Field, { options: FieldOption[] }> =>
  "options" in field;

const option = (label: string): FieldOption => ({ id: `opt_${randomSuffix()}`, label });

/** A new field of `type` with sensible defaults. */
export function newField(type: FieldType): Field {
  const id = `fld_${randomSuffix()}`;
  switch (type) {
    case "select":
    case "radio":
    case "checkboxes":
    case "multiselect":
      return {
        id,
        type,
        label: FIELD_TYPE_LABELS[type],
        options: [option("Option 1"), option("Option 2")],
      };
    case "consent":
      return { id, type, label: "I agree to the terms", required: true };
    default:
      return { id, type, label: FIELD_TYPE_LABELS[type] };
  }
}

/** Drops keys whose value is `undefined` (the schema forbids explicit undefined values). */
function clean<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

const replaceField = (form: Form, id: string, update: (field: Field) => Field): Form => ({
  ...form,
  fields: form.fields.map((f) => (f.id === id ? update(f) : f)),
});

export function addField(
  form: Form,
  type: FieldType,
  index = form.fields.length,
): { form: Form; id: string } {
  if (form.fields.length >= MAX_FIELDS) return { form, id: "" };
  const field = newField(type);
  const fields = [...form.fields];
  fields.splice(index, 0, field);
  return { form: { ...form, fields }, id: field.id };
}

/** Changes properties of one field. `undefined` removes a property. */
export function updateField(form: Form, id: string, patch: Record<string, unknown>): Form {
  return replaceField(form, id, (f) => clean<Field>({ ...f, ...patch }));
}

export function removeField(form: Form, id: string): Form {
  return { ...form, fields: form.fields.filter((f) => f.id !== id) };
}

export function duplicateField(form: Form, id: string): { form: Form; id: string } {
  const index = form.fields.findIndex((f) => f.id === id);
  const source = form.fields[index];
  if (!source || form.fields.length >= MAX_FIELDS) return { form, id: "" };
  const copy: Field = hasOptions(source)
    ? {
        ...source,
        id: `fld_${randomSuffix()}`,
        options: source.options.map((o) => option(o.label)),
      }
    : { ...source, id: `fld_${randomSuffix()}` };
  const fields = [...form.fields];
  fields.splice(index + 1, 0, copy);
  return { form: { ...form, fields }, id: copy.id };
}

/** Moves a field by `delta` positions (clamped to the list). */
export function moveField(form: Form, id: string, delta: number): Form {
  const from = form.fields.findIndex((f) => f.id === id);
  if (from < 0) return form;
  return moveFieldTo(form, id, Math.max(0, Math.min(form.fields.length - 1, from + delta)));
}

export function moveFieldTo(form: Form, id: string, to: number): Form {
  const from = form.fields.findIndex((f) => f.id === id);
  const field = form.fields[from];
  if (!field || from === to) return form;
  const fields = form.fields.filter((f) => f.id !== id);
  fields.splice(to, 0, field);
  return { ...form, fields };
}

function withOptions(
  form: Form,
  fieldId: string,
  update: (options: FieldOption[]) => FieldOption[],
): Form {
  return replaceField(form, fieldId, (f) => {
    if (!hasOptions(f)) return f;
    const options = update(f.options);
    // Keep selection limits valid when options disappear.
    const fixed = { ...f, options } as Field & Record<string, unknown>;
    for (const key of ["minSelected", "maxSelected"]) {
      const n = fixed[key];
      if (typeof n === "number" && n > options.length) fixed[key] = undefined;
    }
    return clean(fixed);
  });
}

export const addOption = (form: Form, fieldId: string): Form =>
  withOptions(form, fieldId, (options) =>
    options.length >= MAX_OPTIONS
      ? options
      : [...options, option(`Option ${String(options.length + 1)}`)],
  );

export const updateOption = (form: Form, fieldId: string, optionId: string, label: string): Form =>
  withOptions(form, fieldId, (options) =>
    options.map((o) => (o.id === optionId ? { ...o, label } : o)),
  );

/** Removes an option; a choice field always keeps at least one. */
export const removeOption = (form: Form, fieldId: string, optionId: string): Form =>
  withOptions(form, fieldId, (options) =>
    options.length <= 1 ? options : options.filter((o) => o.id !== optionId),
  );

export const moveOption = (form: Form, fieldId: string, optionId: string, delta: number): Form =>
  withOptions(form, fieldId, (options) => {
    const from = options.findIndex((o) => o.id === optionId);
    const to = Math.max(0, Math.min(options.length - 1, from + delta));
    const moved = options[from];
    if (!moved || from === to) return options;
    const next = options.filter((o) => o.id !== optionId);
    next.splice(to, 0, moved);
    return next;
  });

/** Title and description. An empty description is removed rather than stored. */
export function updateMeta(form: Form, patch: { title?: string; description?: string }): Form {
  return clean({
    ...form,
    ...patch,
    description: (patch.description ?? form.description) || undefined,
  });
}

/** Merges settings; empty strings and `undefined` remove a setting, and empty objects disappear. */
export function updateSettings(form: Form, patch: Partial<FormSettings>): Form {
  const entries = Object.entries({ ...form.settings, ...patch } as Record<string, unknown>)
    .map(([key, value]): [string, unknown] =>
      value !== null && typeof value === "object" ? [key, clean(value)] : [key, value],
    )
    .filter(
      ([, value]) =>
        value !== undefined &&
        value !== "" &&
        value !== null &&
        !(typeof value === "object" && Object.keys(value).length === 0),
    );
  const rest = { ...form };
  delete rest.settings;
  return entries.length ? { ...rest, settings: Object.fromEntries(entries) } : rest;
}

/** Groups schema issues by field ID (`fields.3.label` → the fourth field); others go under "". */
export function issuesByField(
  form: Form,
  issues: readonly { path: string; message: string }[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const issue of issues) {
    const match = /^fields\.(\d+)(?:\.(.+))?$/.exec(issue.path);
    const field = match ? form.fields[Number(match[1])] : undefined;
    const key = field?.id ?? "";
    const where = match ? (match[2] ?? "") : issue.path;
    const list = out.get(key) ?? [];
    list.push(where ? `${where}: ${issue.message}` : issue.message);
    out.set(key, list);
  }
  return out;
}
