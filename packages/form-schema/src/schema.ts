import { z } from "zod";
import {
  CONDITION_OPERATORS,
  FORM_SCHEMA_VERSION,
  MAX_CONDITION_RULES,
  MAX_CONDITION_TEXT,
  MAX_FIELDS,
  MAX_HIDDEN_LENGTH,
  MAX_OPTIONS,
  MAX_TEXT_LENGTH,
  MAX_SUM_FIELDS,
  OPERATORS_BY_TYPE,
  SUMMABLE_TYPES,
  VALUELESS_OPERATORS,
  isAnswerField,
} from "./limits.js";

/** At least one non-whitespace character. */
const nonBlank = /\S/;

export const formIdSchema = z
  .string()
  .regex(/^frm_[A-Za-z0-9]{6,32}$/, "Form IDs look like frm_ followed by 6-32 letters or digits");
export const fieldIdSchema = z
  .string()
  .regex(/^fld_[a-z0-9_]{1,48}$/, "Field IDs look like fld_ followed by 1-48 of a-z, 0-9, _");
export const optionIdSchema = z
  .string()
  .regex(/^opt_[a-z0-9_]{1,48}$/, "Option IDs look like opt_ followed by 1-48 of a-z, 0-9, _");

const labelSchema = z.string().min(1).max(500).regex(nonBlank, "Must not be blank");
const descriptionSchema = z.string().max(2_000);
const placeholderSchema = z.string().max(200);
const isoDateSchema = z.iso.date();
const lengthSchema = z.int().min(0).max(MAX_TEXT_LENGTH);

export const optionSchema = z.strictObject({
  id: optionIdSchema,
  label: z.string().min(1).max(200).regex(nonBlank, "Must not be blank"),
  /** Points a calculation adds when this option is chosen (ADR 0022). */
  score: z.number().min(-1_000_000).max(1_000_000).optional(),
});

/** One test on an earlier field's answer (ADR 0017). */
export const conditionRuleSchema = z.strictObject({
  field: fieldIdSchema,
  op: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string().max(MAX_CONDITION_TEXT), z.number()]).optional(),
});

/** Shows the field only when all (or any) of the rules hold. */
export const showIfSchema = z.strictObject({
  match: z.enum(["all", "any"]),
  rules: z.array(conditionRuleSchema).min(1).max(MAX_CONDITION_RULES),
});

const base = {
  id: fieldIdSchema,
  label: labelSchema,
  description: descriptionSchema.optional(),
  required: z.boolean().optional(),
  showIf: showIfSchema.optional(),
  /** Required only when these conditions hold (ADR 0019); not together with `required`. */
  requiredIf: showIfSchema.optional(),
  /** `half` puts the field next to a neighbouring half-width field on wide screens. */
  width: z.enum(["full", "half"]).optional(),
};

const textual = {
  ...base,
  placeholder: placeholderSchema.optional(),
  minLength: lengthSchema.optional(),
  maxLength: lengthSchema.min(1).optional(),
};

const options = z.array(optionSchema).min(1).max(MAX_OPTIONS);

/** The shape a short answer must have (ADR 0020): a preset, or a mask such as `AA-9999`. */
export const answerFormatSchema = z
  .strictObject({
    kind: z.enum(["digits", "letters", "alphanumeric", "url", "mask"]),
    mask: z.string().min(1).max(100).optional(),
    message: z.string().min(1).max(200).regex(nonBlank, "Must not be blank").optional(),
  })
  .refine((m) => (m.kind === "mask") === (m.mask !== undefined), {
    message: "A custom format needs a pattern, and only a custom format has one",
    path: ["mask"],
  });

export const textFieldSchema = z.strictObject({
  type: z.literal("text"),
  ...textual,
  match: answerFormatSchema.optional(),
});
export const textareaFieldSchema = z.strictObject({ type: z.literal("textarea"), ...textual });
export const emailFieldSchema = z.strictObject({
  type: z.literal("email"),
  ...base,
  placeholder: placeholderSchema.optional(),
});
export const phoneFieldSchema = z.strictObject({
  type: z.literal("phone"),
  ...base,
  placeholder: placeholderSchema.optional(),
});
export const numberFieldSchema = z.strictObject({
  type: z.literal("number"),
  ...base,
  placeholder: placeholderSchema.optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  integer: z.boolean().optional(),
});
export const dateFieldSchema = z.strictObject({
  type: z.literal("date"),
  ...base,
  min: isoDateSchema.optional(),
  max: isoDateSchema.optional(),
});
export const selectFieldSchema = z.strictObject({ type: z.literal("select"), ...base, options });
export const radioFieldSchema = z.strictObject({ type: z.literal("radio"), ...base, options });
const multi = {
  ...base,
  options,
  minSelected: z.int().min(0).max(MAX_OPTIONS).optional(),
  maxSelected: z.int().min(1).max(MAX_OPTIONS).optional(),
};
export const checkboxesFieldSchema = z.strictObject({ type: z.literal("checkboxes"), ...multi });
export const multiselectFieldSchema = z.strictObject({ type: z.literal("multiselect"), ...multi });
export const consentFieldSchema = z.strictObject({ type: z.literal("consent"), ...base });

/** Name of a URL query parameter, such as `utm_source`. */
export const paramNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]{1,64}$/, "Use 1-64 letters, digits, _, . or -");

/**
 * Not shown to respondents: its value comes from the form link's query parameter `param`
 * (default: the field ID), from the same parameter of the page an embedded form sits on, or from
 * `defaultValue`. Respondents can change it, so it is for attribution, not for trust.
 */
export const hiddenFieldSchema = z.strictObject({
  type: z.literal("hidden"),
  ...base,
  param: paramNameSchema.optional(),
  defaultValue: z.string().max(MAX_HIDDEN_LENGTH).optional(),
});

/** 1 to `max` stars (3–10, default 5); the answer is the number of stars. */
export const ratingFieldSchema = z.strictObject({
  type: z.literal("rating"),
  ...base,
  max: z.int().min(3).max(10).optional(),
});

/** A linear scale from `min` (0 or 1, default 1) to `max` (2–10, default 5); 0–10 is NPS. */
export const scaleFieldSchema = z.strictObject({
  type: z.literal("scale"),
  ...base,
  min: z.int().min(0).max(1).optional(),
  max: z.int().min(2).max(10).optional(),
  minLabel: z.string().max(60).optional(),
  maxLabel: z.string().max(60).optional(),
});

export const rowIdSchema = z
  .string()
  .regex(/^row_[a-z0-9_]{1,48}$/, "Row IDs look like row_ followed by 1-48 of a-z, 0-9, _");

/** Rows of questions sharing one set of columns (ADR 0023); one choice per row. */
export const matrixFieldSchema = z.strictObject({
  type: z.literal("matrix"),
  ...base,
  rows: z
    .array(
      z.strictObject({
        id: rowIdSchema,
        label: z.string().min(1).max(200).regex(nonBlank, "Must not be blank"),
      }),
    )
    .min(1)
    .max(20),
  columns: z.array(optionSchema).min(2).max(10),
});

/** Options the respondent puts in order (ADR 0023); the answer is the option IDs, best first. */
export const rankingFieldSchema = z.strictObject({
  type: z.literal("ranking"),
  ...base,
  options: z.array(optionSchema).min(2).max(10),
});

/**
 * A number computed from earlier answers (ADR 0022): the sum of `sum`'s fields. Computed by the
 * server, never taken from the browser; `show` displays the running result to respondents.
 */
export const calculationFieldSchema = z.strictObject({
  type: z.literal("calculation"),
  id: fieldIdSchema,
  label: labelSchema,
  description: descriptionSchema.optional(),
  showIf: showIfSchema.optional(),
  width: z.enum(["full", "half"]).optional(),
  sum: z
    .array(fieldIdSchema)
    .min(1, "Calculation: choose at least one question to add up")
    .max(MAX_SUM_FIELDS),
  show: z.boolean().optional(),
});

/**
 * Starts a new page (ADR 0018): its label is the page title. Not an answer: no value, no sheet
 * column, never required. With `showIf`, the whole page is skipped when the conditions fail.
 */
export const pageFieldSchema = z.strictObject({
  type: z.literal("page"),
  id: fieldIdSchema,
  label: labelSchema,
  description: descriptionSchema.optional(),
  showIf: showIfSchema.optional(),
});

export const fieldSchema = z
  .discriminatedUnion("type", [
    textFieldSchema,
    textareaFieldSchema,
    emailFieldSchema,
    phoneFieldSchema,
    numberFieldSchema,
    dateFieldSchema,
    selectFieldSchema,
    radioFieldSchema,
    checkboxesFieldSchema,
    multiselectFieldSchema,
    consentFieldSchema,
    hiddenFieldSchema,
    pageFieldSchema,
    ratingFieldSchema,
    scaleFieldSchema,
    calculationFieldSchema,
    matrixFieldSchema,
    rankingFieldSchema,
  ])
  .superRefine((field, ctx) => {
    const bad = (path: string, message: string) => {
      ctx.addIssue({ code: "custom", path: [path], message });
    };
    if (field.type === "hidden" && (field.required === true || field.requiredIf)) {
      bad("required", "A hidden field can't be required: respondents can't see it");
    }
    if ("requiredIf" in field && field.requiredIf && field.required === true) {
      bad("requiredIf", "Required only if: untick Required first, or remove these conditions");
    }
    if ("minLength" in field && field.minLength !== undefined && field.maxLength !== undefined) {
      if (field.minLength > field.maxLength) bad("minLength", "minLength exceeds maxLength");
    }
    if (field.type === "number" && field.min !== undefined && field.max !== undefined) {
      if (field.min > field.max) bad("min", "min exceeds max");
    }
    if (field.type === "date" && field.min !== undefined && field.max !== undefined) {
      if (field.min > field.max) bad("min", "min is after max");
    }
    if (field.type === "matrix") {
      for (const key of ["rows", "columns"] as const) {
        const seen = new Set<string>();
        field[key].forEach((item, index) => {
          if (seen.has(item.id)) {
            ctx.addIssue({
              code: "custom",
              path: [key, index, "id"],
              message: `Duplicate ID ${item.id}`,
            });
          }
          seen.add(item.id);
        });
      }
    }
    if ("options" in field) {
      const ids = new Set<string>();
      field.options.forEach((option, index) => {
        if (ids.has(option.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["options", index, "id"],
            message: `Duplicate option ID ${option.id}`,
          });
        }
        ids.add(option.id);
      });
    }
    if (field.type === "checkboxes" || field.type === "multiselect") {
      const { minSelected, maxSelected, options: opts } = field;
      if (minSelected !== undefined && maxSelected !== undefined && minSelected > maxSelected) {
        bad("minSelected", "minSelected exceeds maxSelected");
      }
      if (minSelected !== undefined && minSelected > opts.length) {
        bad("minSelected", "minSelected exceeds the number of options");
      }
      if (maxSelected !== undefined && maxSelected > opts.length) {
        bad("maxSelected", "maxSelected exceeds the number of options");
      }
    }
  });

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/** What respondents see after submitting: a message, or another page (https only). */
export const successSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("message"),
    message: z.string().min(1).max(2_000).regex(nonBlank, "Must not be blank"),
  }),
  z.strictObject({
    type: z.literal("redirect"),
    url: z.string().max(2_000).refine(isHttpsUrl, "Use a full web address starting with https://"),
  }),
]);

/** Basic appearance. Colours are validated hex values, so renderers can use them in CSS as-is. */
export const themeSchema = z.strictObject({
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour such as #1f5fd6")
    .optional(),
  colorScheme: z.enum(["auto", "light", "dark"]).optional(),
  /** System font families only: nothing is downloaded from a font service. */
  font: z.enum(["system", "serif", "rounded", "mono"]).optional(),
  corners: z.enum(["square", "rounded", "pill"]).optional(),
  density: z.enum(["comfortable", "compact"]).optional(),
});

export const settingsSchema = z.strictObject({
  submitLabel: z.string().min(1).max(60).regex(nonBlank, "Must not be blank").optional(),
  /** `conversational` shows one question at a time (the form script; without it, all show). */
  mode: z.enum(["classic", "conversational"]).optional(),
  success: successSchema.optional(),
  theme: themeSchema.optional(),
});

export const formSchemaV1 = z
  .strictObject({
    schemaVersion: z.literal(FORM_SCHEMA_VERSION),
    id: formIdSchema,
    title: z.string().min(1).max(200).regex(nonBlank, "Must not be blank"),
    description: z.string().max(5_000).optional(),
    settings: settingsSchema.optional(),
    fields: z.array(fieldSchema).max(MAX_FIELDS),
  })
  .superRefine((form, ctx) => {
    const earlier = new Map<string, Field>();
    form.fields.forEach((field, index) => {
      if (earlier.has(field.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "id"],
          message: `Duplicate field ID ${field.id}`,
        });
      }
      const sets = [
        ["showIf", "Show only if", field.showIf],
        ["requiredIf", "Required only if", "requiredIf" in field ? field.requiredIf : undefined],
      ] as const;
      for (const [key, name, set] of sets) {
        set?.rules.forEach((rule, r) => {
          const problem = ruleProblem(rule, earlier.get(rule.field));
          if (problem) {
            ctx.addIssue({
              code: "custom",
              path: ["fields", index, key, "rules", r],
              message: `${name}: ${problem}`,
            });
          }
        });
      }
      if (field.type === "calculation") {
        field.sum.forEach((id, i) => {
          const source = earlier.get(id);
          const problem = !source
            ? "Calculation: choose a question above this one"
            : !SUMMABLE_TYPES.includes(source.type)
              ? "Calculation: only numbers, ratings, scales, choices and calculations add up"
              : null;
          if (problem)
            ctx.addIssue({ code: "custom", path: ["fields", index, "sum", i], message: problem });
        });
      }
      if (field.type === "page") {
        const before = form.fields[index - 1];
        const problem =
          index === 0
            ? "A page break can't come first: the first page starts with the form"
            : index === form.fields.length - 1
              ? "A page break can't come last: add questions after it"
              : before?.type === "page"
                ? "Two page breaks in a row would leave an empty page"
                : null;
        if (problem)
          ctx.addIssue({ code: "custom", path: ["fields", index, "type"], message: problem });
      }
      earlier.set(field.id, field);
    });
  });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Why a rule can't apply to its source field (only fields above it qualify), or null. */
function ruleProblem(rule: z.infer<typeof conditionRuleSchema>, source: Field | undefined) {
  if (!source) return "choose a question above this one";
  if (!isAnswerField(source)) return "a page break has no answer to test";
  if (!OPERATORS_BY_TYPE[source.type].includes(rule.op)) {
    return `"${rule.op}" doesn't apply to this kind of question`;
  }
  if (VALUELESS_OPERATORS.includes(rule.op)) {
    return rule.value === undefined ? null : "this test takes no value";
  }
  const { value } = rule;
  if (value === undefined || value === "") return "enter a value to compare with";
  if ("options" in source) {
    return typeof value === "string" && source.options.some((o) => o.id === value)
      ? null
      : "choose one of the question's options";
  }
  if (
    source.type === "number" ||
    source.type === "rating" ||
    source.type === "scale" ||
    source.type === "calculation"
  ) {
    return typeof value === "number" && Number.isFinite(value) ? null : "enter a number";
  }
  if (source.type === "date") {
    return typeof value === "string" && ISO_DATE.test(value) ? null : "enter a date";
  }
  return typeof value === "string" && /\S/.test(value) ? null : "enter text to compare with";
}

export type Form = z.infer<typeof formSchemaV1>;
export type Field = z.infer<typeof fieldSchema>;
export type FieldOption = z.infer<typeof optionSchema>;
export type FormSettings = z.infer<typeof settingsSchema>;
export type FormTheme = z.infer<typeof themeSchema>;
export type ShowIf = z.infer<typeof showIfSchema>;
export type AnswerFormat = z.infer<typeof answerFormatSchema>;
export type ConditionRule = z.infer<typeof conditionRuleSchema>;

/** The fields that have answers and sheet columns, in order (page breaks left out). */
export function answerFields(form: Pick<Form, "fields">): Exclude<Field, { type: "page" }>[] {
  return form.fields.filter((f): f is Exclude<Field, { type: "page" }> => f.type !== "page");
}

export interface SchemaIssue {
  /** Location of the problem, e.g. `fields.2.options.0.id`. */
  path: string;
  message: string;
}

export type ParseFormResult =
  { success: true; form: Form } | { success: false; issues: SchemaIssue[] };

/** Validates an untrusted form definition (from the builder, an import or an API client). */
export function parseForm(input: unknown): ParseFormResult {
  const result = formSchemaV1.safeParse(input);
  if (result.success) return { success: true, form: result.data };
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  };
}

/** JSON Schema (draft 2020-12) for form definitions. Cross-field rules are enforced by `parseForm` only. */
export function formJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(formSchemaV1, { target: "draft-2020-12", unrepresentable: "any" });
}
