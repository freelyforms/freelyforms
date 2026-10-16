import type { Field, Form } from "@freelyforms/form-schema";
import {
  DEFAULT_TEXT_MAX_LENGTH,
  DEFAULT_TEXTAREA_MAX_LENGTH,
  MAX_EMAIL_LENGTH,
} from "@freelyforms/form-schema/limits";

/** A normalised answer: text, number, consent flag or list of option IDs. */
export type AnswerValue = string | number | boolean | readonly string[];

export type ValidationErrorCode =
  | "required"
  | "invalid_type"
  | "too_short"
  | "too_long"
  | "invalid_email"
  | "invalid_phone"
  | "not_a_number"
  | "not_an_integer"
  | "too_small"
  | "too_large"
  | "invalid_date"
  | "invalid_option"
  | "too_few_selected"
  | "too_many_selected";

export interface FieldError {
  fieldId: string;
  code: ValidationErrorCode;
  /** Values for the message, e.g. `{ max: 200 }`. Messages are localised by the renderer. */
  params?: Readonly<Record<string, number | string>>;
}

export type ValidationResult =
  | { ok: true; values: Readonly<Record<string, AnswerValue>> }
  | { ok: false; errors: readonly FieldError[] };

type Outcome = { value: AnswerValue } | { empty: true } | { error: Omit<FieldError, "fieldId"> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS = /^\+?[0-9\s().-]+$/;
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const fail = (code: ValidationErrorCode, params?: Record<string, number | string>): Outcome =>
  params ? { error: { code, params } } : { error: { code } };

/** Length in Unicode code points, so most emoji and non-Latin characters count as one. */
function length(s: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    // A high surrogate followed by a low surrogate is one code point.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    count++;
  }
  return count;
}

function isEmpty(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (typeof raw === "string") return raw.trim() === "";
  if (Array.isArray(raw)) return raw.length === 0;
  return false;
}

function validText(field: Extract<Field, { type: "text" | "textarea" }>, raw: unknown): Outcome {
  if (typeof raw !== "string") return fail("invalid_type");
  let value = raw.replace(/\r\n?/g, "\n").trim();
  // Single-line fields never carry line breaks into the sheet.
  if (field.type === "text") value = value.replace(/\s*\n\s*/g, " ");
  const max =
    field.maxLength ??
    (field.type === "text" ? DEFAULT_TEXT_MAX_LENGTH : DEFAULT_TEXTAREA_MAX_LENGTH);
  const len = length(value);
  if (field.minLength !== undefined && len < field.minLength) {
    return fail("too_short", { min: field.minLength });
  }
  if (len > max) return fail("too_long", { max });
  return { value };
}

function validEmail(raw: unknown): Outcome {
  if (typeof raw !== "string") return fail("invalid_type");
  const value = raw.trim();
  if (value.length > MAX_EMAIL_LENGTH || !EMAIL.test(value)) return fail("invalid_email");
  return { value };
}

function validPhone(raw: unknown): Outcome {
  if (typeof raw !== "string") return fail("invalid_type");
  const value = raw.trim().replace(/\s+/g, " ");
  const digits = value.replace(/\D/g, "").length;
  if (!PHONE_CHARS.test(value) || digits < 5 || digits > 15) return fail("invalid_phone");
  return { value };
}

function validNumber(field: Extract<Field, { type: "number" }>, raw: unknown): Outcome {
  let value: number;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && NUMBER.test(raw.trim())) value = Number(raw.trim());
  else return fail("not_a_number");
  if (!Number.isFinite(value)) return fail("not_a_number");
  if (field.integer === true && !Number.isInteger(value)) return fail("not_an_integer");
  if (field.min !== undefined && value < field.min) return fail("too_small", { min: field.min });
  if (field.max !== undefined && value > field.max) return fail("too_large", { max: field.max });
  return { value };
}

function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function validDate(field: Extract<Field, { type: "date" }>, raw: unknown): Outcome {
  if (typeof raw !== "string") return fail("invalid_type");
  const value = raw.trim();
  if (!isCalendarDate(value)) return fail("invalid_date");
  // ISO dates compare correctly as strings.
  if (field.min !== undefined && value < field.min) return fail("too_small", { min: field.min });
  if (field.max !== undefined && value > field.max) return fail("too_large", { max: field.max });
  return { value };
}

function validSingleChoice(
  field: Extract<Field, { type: "select" | "radio" }>,
  raw: unknown,
): Outcome {
  if (typeof raw !== "string") return fail("invalid_type");
  const value = raw.trim();
  if (!field.options.some((o) => o.id === value)) return fail("invalid_option");
  return { value };
}

function validMultiChoice(
  field: Extract<Field, { type: "checkboxes" | "multiselect" }>,
  raw: unknown,
): Outcome {
  const list: unknown[] = Array.isArray(raw) ? raw : [raw];
  if (!list.every((v): v is string => typeof v === "string")) return fail("invalid_type");
  const chosen = new Set(list.map((v) => v.trim()));
  if (![...chosen].every((id) => field.options.some((o) => o.id === id))) {
    return fail("invalid_option");
  }
  // Keep the order of the options in the form, not the order the browser sent.
  const value = field.options.filter((o) => chosen.has(o.id)).map((o) => o.id);
  if (field.minSelected !== undefined && value.length < field.minSelected) {
    return fail("too_few_selected", { min: field.minSelected });
  }
  if (field.maxSelected !== undefined && value.length > field.maxSelected) {
    return fail("too_many_selected", { max: field.maxSelected });
  }
  return { value };
}

function validConsent(field: Extract<Field, { type: "consent" }>, raw: unknown): Outcome {
  const truthy = raw === true || raw === "true" || raw === "on";
  const falsy = raw === false || raw === "false";
  if (!truthy && !falsy) return fail("invalid_type");
  if (!truthy) return field.required === true ? fail("required") : { empty: true };
  return { value: true };
}

function validateField(field: Field, raw: unknown): Outcome {
  if (field.type !== "consent" && isEmpty(raw)) {
    return field.required === true ? fail("required") : { empty: true };
  }
  switch (field.type) {
    case "text":
    case "textarea":
      return validText(field, raw);
    case "email":
      return validEmail(raw);
    case "phone":
      return validPhone(raw);
    case "number":
      return validNumber(field, raw);
    case "date":
      return validDate(field, raw);
    case "select":
    case "radio":
      return validSingleChoice(field, raw);
    case "checkboxes":
    case "multiselect":
      return validMultiChoice(field, raw);
    case "consent":
      return isEmpty(raw)
        ? field.required === true
          ? fail("required")
          : { empty: true }
        : validConsent(field, raw);
  }
}

/**
 * Validates and normalises a respondent's answers against a published form.
 *
 * Runs unchanged in the browser and on the server; the server result is authoritative.
 * Keys that are not field IDs of the form are ignored and never returned.
 */
export function validateSubmission(
  form: Pick<Form, "fields">,
  answers: Readonly<Record<string, unknown>>,
): ValidationResult {
  const values: Record<string, AnswerValue> = {};
  const errors: FieldError[] = [];
  for (const field of form.fields) {
    const raw = Object.hasOwn(answers, field.id) ? answers[field.id] : undefined;
    const outcome = validateField(field, raw);
    if ("error" in outcome) errors.push({ fieldId: field.id, ...outcome.error });
    else if ("value" in outcome) values[field.id] = outcome.value;
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, values };
}
