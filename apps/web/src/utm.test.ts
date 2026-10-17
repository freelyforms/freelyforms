import type { Form } from "@freelyforms/form-schema";
import { describe, expect, it } from "vitest";
import { addUtmFields } from "./draft.js";

const base: Form = { schemaVersion: 1, id: "frm_test01", title: "T", fields: [] };

describe("addUtmFields", () => {
  it("adds one hidden field per UTM parameter, once", () => {
    const first = addUtmFields(base);
    expect(first.added).toBe(5);
    expect(first.form.fields.map((f) => (f.type === "hidden" ? f.param : f.type))).toEqual([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
    ]);
    expect(addUtmFields(first.form).added).toBe(0);
  });

  it("keeps field IDs unique", () => {
    const taken: Form = {
      ...base,
      fields: [{ id: "fld_utm_source", type: "text", label: "Taken" }],
    };
    const ids = addUtmFields(taken).form.fields.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
