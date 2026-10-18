import type { Field, Form } from "@freelyforms/form-schema";
import { MAX_HIDDEN_LENGTH, MAX_TEXT_LENGTH } from "@freelyforms/form-schema/limits";

const matchOption = (field: Extract<Field, { options: unknown }>, value: string) => {
  const wanted = value.trim().toLowerCase();
  return field.options.find((o) => o.id === value || o.label.trim().toLowerCase() === wanted)?.id;
};

/**
 * Starting values from the form link's query string: `?fld_email=ada@example.com` fills a field
 * by its ID, choice fields accept an option ID or its label (repeat the parameter for several),
 * and hidden fields read their own parameter. Consent is never prefilled: agreeing is the
 * respondent's own act. Values are only suggestions; the submission is validated as usual.
 */
export function prefillValues(form: Pick<Form, "fields">, query: URLSearchParams) {
  const values: Record<string, string | string[]> = {};
  for (const field of form.fields) {
    if (field.type === "hidden") {
      const value = query.get(field.param ?? field.id);
      if (value) values[field.id] = Array.from(value).slice(0, MAX_HIDDEN_LENGTH).join("");
      continue;
    }
    const given = query.getAll(field.id).filter((v) => v.trim() !== "");
    const first = given[0];
    if (first === undefined) continue;
    switch (field.type) {
      case "consent":
      case "page":
      case "calculation":
        break;
      case "select":
      case "radio": {
        const id = matchOption(field, first);
        if (id) values[field.id] = id;
        break;
      }
      case "checkboxes":
      case "multiselect": {
        const ids = given.map((v) => matchOption(field, v)).filter((id) => id !== undefined);
        if (ids.length) values[field.id] = ids;
        break;
      }
      default:
        values[field.id] = first.slice(0, MAX_TEXT_LENGTH);
    }
  }
  return values;
}
