import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIELD_TYPES, MAX_FIELDS, parseForm, type Form } from "./index.js";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"));

const minimal = (fields: unknown[]): unknown => ({
  schemaVersion: 1,
  id: "frm_test01",
  title: "Test",
  fields,
});

const issuesOf = (input: unknown): string[] => {
  const result = parseForm(input);
  return result.success ? [] : result.issues.map((i) => `${i.path}: ${i.message}`);
};

describe("parseForm", () => {
  it.each(["contact", "all-fields"])("accepts the %s fixture", (name) => {
    const result = parseForm(fixture(name));
    expect(result.success).toBe(true);
  });

  it("covers every field type in the all-fields fixture", () => {
    const result = parseForm(fixture("all-fields"));
    if (!result.success) throw new Error("fixture must parse");
    const types = new Set(result.form.fields.map((f) => f.type));
    expect([...types].sort()).toEqual([...FIELD_TYPES].sort());
  });

  it("rejects an unknown schema version", () => {
    expect(issuesOf({ ...(minimal([]) as object), schemaVersion: 2 })).not.toEqual([]);
  });

  it("rejects unknown properties instead of silently dropping them", () => {
    const issues = issuesOf(minimal([{ id: "fld_a", type: "text", label: "A", colour: "red" }]));
    expect(issues.join()).toMatch(/colour/);
  });

  it("accepts a theme and rejects colours that are not plain hex", () => {
    const themed = (theme: unknown) => ({ ...(minimal([]) as object), settings: { theme } });
    expect(issuesOf(themed({ accent: "#1F5fd6", colorScheme: "dark" }))).toEqual([]);
    expect(issuesOf(themed({ accent: "red;}body{display:none" }))).not.toEqual([]);
    expect(issuesOf(themed({ colorScheme: "sepia" }))).not.toEqual([]);
  });

  it("rejects unknown field types", () => {
    expect(issuesOf(minimal([{ id: "fld_a", type: "html", label: "A" }]))).not.toEqual([]);
  });

  it("rejects duplicate field IDs", () => {
    const issues = issuesOf(
      minimal([
        { id: "fld_a", type: "text", label: "A" },
        { id: "fld_a", type: "email", label: "B" },
      ]),
    );
    expect(issues).toContain("fields.1.id: Duplicate field ID fld_a");
  });

  it("rejects duplicate option IDs within a field", () => {
    const issues = issuesOf(
      minimal([
        {
          id: "fld_a",
          type: "radio",
          label: "A",
          options: [
            { id: "opt_x", label: "X" },
            { id: "opt_x", label: "Y" },
          ],
        },
      ]),
    );
    expect(issues.join()).toMatch(/Duplicate option ID opt_x/);
  });

  it.each([
    ["minLength > maxLength", { type: "text", minLength: 5, maxLength: 2 }],
    ["number min > max", { type: "number", min: 5, max: 1 }],
    ["date min after max", { type: "date", min: "2026-05-01", max: "2026-01-01" }],
    ["impossible date", { type: "date", min: "2026-02-30" }],
    ["text longer than a Sheets cell", { type: "text", maxLength: 50_001 }],
    ["choice without options", { type: "select", options: [] }],
  ])("rejects %s", (_name, extra) => {
    expect(issuesOf(minimal([{ id: "fld_a", label: "A", ...extra }]))).not.toEqual([]);
  });

  it("rejects minSelected greater than the number of options", () => {
    const issues = issuesOf(
      minimal([
        {
          id: "fld_a",
          type: "checkboxes",
          label: "A",
          minSelected: 3,
          options: [{ id: "opt_x", label: "X" }],
        },
      ]),
    );
    expect(issues.join()).toMatch(/minSelected exceeds the number of options/);
  });

  it("rejects maxSelected greater than the number of options", () => {
    const issues = issuesOf(
      minimal([
        {
          id: "fld_a",
          type: "multiselect",
          label: "A",
          maxSelected: 2,
          options: [{ id: "opt_x", label: "X" }],
        },
      ]),
    );
    expect(issues.join()).toMatch(/maxSelected exceeds the number of options/);
  });

  it.each(["fld_", "FLD_a", "fld_A", "field_a", "fld_a-b"])("rejects field ID %s", (id) => {
    expect(issuesOf(minimal([{ id, type: "text", label: "A" }]))).not.toEqual([]);
  });

  it("rejects blank labels", () => {
    expect(issuesOf(minimal([{ id: "fld_a", type: "text", label: "   " }]))).not.toEqual([]);
  });

  it(`rejects more than ${String(MAX_FIELDS)} fields`, () => {
    const fields = Array.from({ length: MAX_FIELDS + 1 }, (_, i) => ({
      id: `fld_${String(i)}`,
      type: "text",
      label: "A",
    }));
    expect(issuesOf(minimal(fields))).not.toEqual([]);
  });

  it("returns a typed form", () => {
    const result = parseForm(fixture("contact"));
    if (!result.success) throw new Error("fixture must parse");
    const form: Form = result.form;
    expect(form.fields[0]?.label).toBe("Name");
  });
});

describe("docs/FORM_SCHEMA.md", () => {
  it("contains only valid JSON examples", () => {
    const doc = readFileSync(new URL("../../../docs/FORM_SCHEMA.md", import.meta.url), "utf8");
    const examples = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) expect(issuesOf(JSON.parse(example))).toEqual([]);
  });
});
