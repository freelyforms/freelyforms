import { z } from "zod";
import {
  FORM_SCHEMA_VERSION,
  MAX_FIELDS,
  MAX_HIDDEN_LENGTH,
  MAX_OPTIONS,
  MAX_TEXT_LENGTH,
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
});

const base = {
  id: fieldIdSchema,
  label: labelSchema,
  description: descriptionSchema.optional(),
  required: z.boolean().optional(),
};

const textual = {
  ...base,
  placeholder: placeholderSchema.optional(),
  minLength: lengthSchema.optional(),
  maxLength: lengthSchema.min(1).optional(),
};

const options = z.array(optionSchema).min(1).max(MAX_OPTIONS);

export const textFieldSchema = z.strictObject({ type: z.literal("text"), ...textual });
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
  ])
  .superRefine((field, ctx) => {
    const bad = (path: string, message: string) => {
      ctx.addIssue({ code: "custom", path: [path], message });
    };
    if (field.type === "hidden" && field.required === true) {
      bad("required", "A hidden field can't be required: respondents can't see it");
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
});

export const settingsSchema = z.strictObject({
  submitLabel: z.string().min(1).max(60).regex(nonBlank, "Must not be blank").optional(),
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
    const ids = new Set<string>();
    form.fields.forEach((field, index) => {
      if (ids.has(field.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "id"],
          message: `Duplicate field ID ${field.id}`,
        });
      }
      ids.add(field.id);
    });
  });

export type Form = z.infer<typeof formSchemaV1>;
export type Field = z.infer<typeof fieldSchema>;
export type FieldOption = z.infer<typeof optionSchema>;
export type FormSettings = z.infer<typeof settingsSchema>;
export type FormTheme = z.infer<typeof themeSchema>;

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
