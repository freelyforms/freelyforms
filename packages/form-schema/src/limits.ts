/** Current version of the form schema format. Bumped only with a migration. */
export const FORM_SCHEMA_VERSION = 1;

/** Maximum fields in one form. */
export const MAX_FIELDS = 200;
/** Maximum options in one choice field. */
export const MAX_OPTIONS = 500;
/** Google Sheets rejects cells longer than 50,000 characters. */
export const MAX_TEXT_LENGTH = 50_000;
/** Default maximum length when a `text` field sets none. */
export const DEFAULT_TEXT_MAX_LENGTH = 1_000;
/** Default maximum length when a `textarea` field sets none. */
export const DEFAULT_TEXTAREA_MAX_LENGTH = 10_000;
/** Longest value a hidden field keeps (from a link or the page an embedded form sits on). */
export const MAX_HIDDEN_LENGTH = 1_000;
/** RFC 5321 limit for a forward path. */
export const MAX_EMAIL_LENGTH = 254;

export const FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "date",
  "select",
  "radio",
  "checkboxes",
  "multiselect",
  "consent",
  "hidden",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** Field types whose answer is one option ID. */
export const SINGLE_CHOICE_TYPES = ["select", "radio"] as const;
/** Field types whose answer is a list of option IDs. */
export const MULTI_CHOICE_TYPES = ["checkboxes", "multiselect"] as const;
