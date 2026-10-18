import { parseForm, type Field, type Form } from "@freelyforms/form-schema";
import { FIELD_TYPES } from "@freelyforms/form-schema/limits";
import { describe, expect, it } from "vitest";
import {
  addField,
  addOption,
  duplicateField,
  issuesByField,
  moveField,
  moveFieldTo,
  newField,
  removeField,
  removeOption,
  updateField,
  updateMeta,
  updateSettings,
} from "./draft.js";

const empty: Form = { schemaVersion: 1, id: "frm_test01", title: "T", fields: [] };

const valid = (form: Form) => {
  const result = parseForm(form);
  return result.success ? [] : result.issues;
};

describe("draft edits", () => {
  it("creates a valid default for every field type", () => {
    let form = empty;
    for (const type of FIELD_TYPES) form = addField(form, type).form;
    expect(valid(form)).toEqual([]);
    expect(new Set(form.fields.map((f) => f.id)).size).toBe(FIELD_TYPES.length);
  });

  it("never mutates its input", () => {
    const { form } = addField(empty, "text");
    const frozen = structuredClone(form);
    updateField(form, form.fields[0]?.id ?? "", { label: "Changed" });
    moveField(form, form.fields[0]?.id ?? "", 1);
    expect(form).toEqual(frozen);
  });

  it("removes properties set to undefined so the schema accepts the result", () => {
    const added = addField(empty, "number");
    const id = added.id;
    let form = added.form;
    form = updateField(form, id, { min: 1, integer: true });
    form = updateField(form, id, { min: undefined, integer: undefined });
    expect(form.fields[0]).not.toHaveProperty("min");
    expect(form.fields[0]).not.toHaveProperty("integer");
    expect(valid(form)).toEqual([]);
  });

  it("reorders fields", () => {
    let form = empty;
    for (const type of ["text", "email", "phone"] as const) form = addField(form, type).form;
    const [a, b, c] = form.fields.map((f) => f.id);
    expect(moveField(form, a ?? "", 1).fields.map((f) => f.id)).toEqual([b, a, c]);
    expect(moveField(form, a ?? "", -1)).toBe(form);
    expect(moveFieldTo(form, c ?? "", 0).fields.map((f) => f.id)).toEqual([c, a, b]);
  });

  it("duplicates a choice field with fresh field and option IDs", () => {
    const { form, id } = addField(empty, "radio");
    const copy = duplicateField(form, id);
    const [original, dup] = copy.form.fields;
    expect(dup?.id).not.toBe(original?.id);
    expect(dup && "options" in dup ? dup.options.map((o) => o.label) : []).toEqual([
      "Option 1",
      "Option 2",
    ]);
    expect(valid(copy.form)).toEqual([]);
  });

  it("keeps at least one option and keeps selection limits valid", () => {
    const added = addField(empty, "checkboxes");
    const id = added.id;
    let form = added.form;
    form = addOption(form, id);
    form = updateField(form, id, { maxSelected: 3 });
    const field = () => form.fields[0] as Extract<Form["fields"][number], { type: "checkboxes" }>;
    form = removeOption(form, id, field().options[2]?.id ?? "");
    expect(field()).not.toHaveProperty("maxSelected");
    form = removeOption(form, id, field().options[1]?.id ?? "");
    form = removeOption(form, id, field().options[0]?.id ?? "");
    expect(field().options).toHaveLength(1);
    expect(valid(form)).toEqual([]);
  });

  it("drops empty descriptions and empty settings", () => {
    let form = updateMeta(empty, { description: "Hello" });
    expect(form.description).toBe("Hello");
    form = updateMeta(form, { description: "" });
    expect(form).not.toHaveProperty("description");
    form = updateSettings(form, { theme: { accent: "#ff0000" }, submitLabel: "Send" });
    expect(form.settings).toEqual({ theme: { accent: "#ff0000" }, submitLabel: "Send" });
    form = updateSettings(form, { theme: { accent: undefined }, submitLabel: "" });
    expect(form).not.toHaveProperty("settings");
    expect(valid(form)).toEqual([]);
  });

  it("maps schema issues to the field they belong to", () => {
    const { form, id } = addField(empty, "text");
    const blank = updateField(form, id, { label: " " });
    const result = parseForm(blank);
    if (result.success) throw new Error("blank label must fail");
    const byField = issuesByField(blank, result.issues);
    expect(byField.get(id)?.[0]).toMatch(/^label: /);
  });

  it("generates schema-valid IDs", () => {
    expect(newField("text").id).toMatch(/^fld_[a-z0-9]{8}$/);
  });
});

describe("conditions in draft edits (ADR 0017)", () => {
  const withCondition = () => {
    let form = addField(empty, "radio").form;
    form = addField(form, "text").form;
    const [choice, text] = form.fields as [Field & { options: { id: string }[] }, Field];
    const value = choice.options[0]?.id ?? "";
    return {
      form: updateField(form, text.id, {
        showIf: { match: "all", rules: [{ field: choice.id, op: "equals", value }] },
      }),
      choice,
      text,
      value,
    };
  };

  it("removes conditions on a deleted field", () => {
    const { form, choice, text } = withCondition();
    expect(valid(form)).toEqual([]);
    const next = removeField(form, choice.id);
    expect(next.fields.find((f) => f.id === text.id)?.showIf).toBeUndefined();
    expect(valid(next)).toEqual([]);
  });

  it("removes conditions on a deleted option, and keeps them when nothing is removed", () => {
    const { form, choice, text, value } = withCondition();
    const next = removeOption(form, choice.id, value);
    expect(next.fields.find((f) => f.id === text.id)?.showIf).toBeUndefined();
    const single = removeOption(next, choice.id, choice.options[1]?.id ?? "");
    expect(single).toBe(next);
  });

  it("reports a condition on a later field after a move, on the field itself", () => {
    const { form, text } = withCondition();
    const moved = moveField(form, text.id, -1);
    const result = parseForm(moved);
    if (result.success) throw new Error("expected a schema problem");
    expect(issuesByField(moved, result.issues).get(text.id)).toEqual([
      "Show only if: choose a question above this one",
    ]);
  });
});
