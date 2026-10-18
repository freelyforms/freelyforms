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
  "page",
  "rating",
  "scale",
  "calculation",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** Field types whose answer is one option ID. */
export const SINGLE_CHOICE_TYPES = ["select", "radio"] as const;
/** Field types whose answer is a list of option IDs. */
export const MULTI_CHOICE_TYPES = ["checkboxes", "multiselect"] as const;

/** Most rules in one field's `showIf` (ADR 0017). */
export const MAX_CONDITION_RULES = 10;
/** Longest text a condition compares against. */
export const MAX_CONDITION_TEXT = 1_000;

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "greater_than",
  "less_than",
  "is_empty",
  "is_not_empty",
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

/** Operators that compare with no value. */
export const VALUELESS_OPERATORS: readonly ConditionOperator[] = ["is_empty", "is_not_empty"];

/** Which operators a condition may use on each source field type (ADR 0017). */
export const OPERATORS_BY_TYPE: Readonly<Record<FieldType, readonly ConditionOperator[]>> = {
  text: ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty"],
  textarea: ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty"],
  email: ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty"],
  phone: ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty"],
  hidden: ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty"],
  number: ["equals", "not_equals", "greater_than", "less_than", "is_empty", "is_not_empty"],
  date: ["equals", "not_equals", "greater_than", "less_than", "is_empty", "is_not_empty"],
  select: ["equals", "not_equals", "is_empty", "is_not_empty"],
  radio: ["equals", "not_equals", "is_empty", "is_not_empty"],
  checkboxes: ["contains", "not_contains", "is_empty", "is_not_empty"],
  multiselect: ["contains", "not_contains", "is_empty", "is_not_empty"],
  consent: ["is_empty", "is_not_empty"],
  // A page break has no answer to test (ADR 0018).
  page: [],
  rating: ["equals", "not_equals", "greater_than", "less_than", "is_empty", "is_not_empty"],
  scale: ["equals", "not_equals", "greater_than", "less_than", "is_empty", "is_not_empty"],
  calculation: ["equals", "not_equals", "greater_than", "less_than", "is_empty", "is_not_empty"],
};

/** Whether a field has an answer and a sheet column (page breaks don't, ADR 0018). */
export const isAnswerField = (field: { type: FieldType }): boolean => field.type !== "page";

/** Stars in a rating when the field sets none. */
export const DEFAULT_RATING_MAX = 5;
/** Ends of a scale when the field sets none (1 to 5). */
export const DEFAULT_SCALE_MIN = 1;
export const DEFAULT_SCALE_MAX = 5;

/** Field types a calculation can add up (ADR 0022). */
export const SUMMABLE_TYPES: readonly FieldType[] = [
  "number",
  "rating",
  "scale",
  "select",
  "radio",
  "checkboxes",
  "multiselect",
  "calculation",
];
/** Most fields one calculation adds up. */
export const MAX_SUM_FIELDS = 50;
