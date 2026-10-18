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

  it("accepts hidden fields with a URL parameter and rejects required ones", () => {
    const hidden = { id: "fld_src", type: "hidden", label: "Source", param: "utm_source" };
    expect(issuesOf(minimal([hidden]))).toEqual([]);
    expect(issuesOf(minimal([{ ...hidden, required: true }])).join()).toMatch(/can't be required/);
    expect(issuesOf(minimal([{ ...hidden, param: "utm source" }])).join()).toMatch(/param/);
  });

  it("accepts an https redirect after submitting and nothing else", () => {
    const withSuccess = (success: unknown) => ({
      ...(minimal([]) as object),
      settings: { success },
    });
    expect(issuesOf(withSuccess({ type: "redirect", url: "https://example.com/thanks" }))).toEqual(
      [],
    );
    for (const url of ["http://example.com", "javascript:alert(1)", "example.com", ""]) {
      expect(issuesOf(withSuccess({ type: "redirect", url })), url).not.toEqual([]);
    }
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

describe("showIf (ADR 0017)", () => {
  const plan = {
    id: "fld_plan",
    type: "radio",
    label: "Plan",
    options: [
      { id: "opt_personal", label: "Personal" },
      { id: "opt_business", label: "Business" },
    ],
  };
  const company = (showIf: unknown) => ({
    id: "fld_company",
    type: "text",
    label: "Company",
    showIf,
  });
  const rule = (r: Record<string, unknown>) => ({
    match: "all",
    rules: [{ field: "fld_plan", ...r }],
  });

  it("accepts rules on earlier fields with operators and values that fit them", () => {
    expect(
      issuesOf(minimal([plan, company(rule({ op: "equals", value: "opt_business" }))])),
    ).toEqual([]);
    expect(issuesOf(minimal([plan, company(rule({ op: "is_not_empty" }))]))).toEqual([]);
    const age = { id: "fld_age", type: "number", label: "Age" };
    const guardian = {
      id: "fld_guardian",
      type: "text",
      label: "Guardian",
      showIf: { match: "any", rules: [{ field: "fld_age", op: "less_than", value: 18 }] },
    };
    expect(issuesOf(minimal([age, guardian]))).toEqual([]);
  });

  it("rejects later, missing or self references", () => {
    expect(issuesOf(minimal([company(rule({ op: "is_empty" })), plan]))).toEqual([
      "fields.0.showIf.rules.0: Show only if: choose a question above this one",
    ]);
    const self = { ...plan, showIf: rule({ op: "is_empty" }) };
    expect(issuesOf(minimal([self]))).toHaveLength(1);
  });

  it("rejects operators, values and options that don't fit the source", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ op: "greater_than", value: "opt_business" }, "doesn't apply"],
      [{ op: "equals", value: "opt_nope" }, "choose one of the question's options"],
      [{ op: "equals" }, "enter a value"],
      [{ op: "is_empty", value: "opt_business" }, "takes no value"],
    ];
    for (const [r, message] of cases) {
      const issues = issuesOf(minimal([plan, company(rule(r))]));
      expect(issues.join(), JSON.stringify(r)).toContain(message);
    }
    const age = { id: "fld_age", type: "number", label: "Age" };
    const later = {
      id: "fld_x",
      type: "text",
      label: "X",
      showIf: { match: "all", rules: [{ field: "fld_age", op: "equals", value: "18" }] },
    };
    expect(issuesOf(minimal([age, later])).join()).toContain("enter a number");
  });

  it("limits the number of rules", () => {
    const rules = Array.from({ length: 11 }, () => ({ field: "fld_plan", op: "is_empty" }));
    expect(issuesOf(minimal([plan, company({ match: "all", rules })]))).not.toEqual([]);
  });
});

describe("page breaks (ADR 0018)", () => {
  const q = (id: string) => ({ id, type: "text", label: id });
  const page = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    type: "page",
    label: "Next page",
    ...extra,
  });

  it("accepts page breaks between questions, with a condition", () => {
    const skip = { match: "all", rules: [{ field: "fld_a", op: "is_not_empty" }] };
    expect(issuesOf(minimal([q("fld_a"), page("fld_p", { showIf: skip }), q("fld_b")]))).toEqual(
      [],
    );
  });

  it("rejects empty pages, required page breaks and conditions that test a page break", () => {
    expect(issuesOf(minimal([page("fld_p"), q("fld_a")])).join()).toContain("can't come first");
    expect(issuesOf(minimal([q("fld_a"), page("fld_p")])).join()).toContain("can't come last");
    expect(
      issuesOf(minimal([q("fld_a"), page("fld_p"), page("fld_r"), q("fld_b")])).join(),
    ).toContain("Two page breaks");
    expect(
      issuesOf(minimal([q("fld_a"), page("fld_p", { required: true }), q("fld_b")])),
    ).not.toEqual([]);
    const testsPage = {
      ...q("fld_b"),
      showIf: { match: "all", rules: [{ field: "fld_p", op: "is_empty" }] },
    };
    expect(issuesOf(minimal([q("fld_a"), page("fld_p"), testsPage])).join()).toContain(
      "a page break has no answer",
    );
  });
});

describe("requiredIf (ADR 0019)", () => {
  const plan = {
    id: "fld_plan",
    type: "select",
    label: "Plan",
    options: [{ id: "opt_business", label: "Business" }],
  };
  const when = {
    match: "all",
    rules: [{ field: "fld_plan", op: "equals", value: "opt_business" }],
  };

  it("accepts conditions on earlier fields, like showIf", () => {
    expect(
      issuesOf(minimal([plan, { id: "fld_vat", type: "text", label: "VAT", requiredIf: when }])),
    ).toEqual([]);
  });

  it("rejects it next to required, on hidden fields, and with bad rules", () => {
    const both = { id: "fld_vat", type: "text", label: "VAT", required: true, requiredIf: when };
    expect(issuesOf(minimal([plan, both])).join()).toContain("untick Required");
    const hidden = { id: "fld_src", type: "hidden", label: "Source", requiredIf: when };
    expect(issuesOf(minimal([plan, hidden])).join()).toContain("can't be required");
    const later = { id: "fld_vat", type: "text", label: "VAT", requiredIf: when };
    expect(issuesOf(minimal([later, plan]))).toEqual([
      "fields.0.requiredIf.rules.0: Required only if: choose a question above this one",
    ]);
  });
});

describe("answer formats (ADR 0020)", () => {
  const text = (match: unknown) =>
    minimal([{ id: "fld_code", type: "text", label: "Code", match }]);

  it("accepts presets and masks", () => {
    expect(issuesOf(text({ kind: "digits" }))).toEqual([]);
    expect(
      issuesOf(text({ kind: "mask", mask: "AA-9999", message: "Use your order code" })),
    ).toEqual([]);
  });

  it("needs a mask exactly for the mask kind, and only on short text", () => {
    expect(issuesOf(text({ kind: "mask" })).join()).toContain("needs a pattern");
    expect(issuesOf(text({ kind: "digits", mask: "99" })).join()).toContain("needs a pattern");
    expect(issuesOf(text({ kind: "regex", mask: ".*" }))).not.toEqual([]);
    const long = minimal([
      { id: "fld_t", type: "textarea", label: "T", match: { kind: "digits" } },
    ]);
    expect(issuesOf(long)).not.toEqual([]);
  });
});

describe("calculations (ADR 0022)", () => {
  const n = { id: "fld_n", type: "number", label: "N" };
  const calc = (sum: string[]) => ({ id: "fld_c", type: "calculation", label: "C", sum });

  it("adds up earlier numeric and choice fields only", () => {
    expect(issuesOf(minimal([n, calc(["fld_n"])]))).toEqual([]);
    expect(issuesOf(minimal([calc(["fld_n"]), n])).join()).toContain("choose a question above");
    const t = { id: "fld_t", type: "text", label: "T" };
    expect(issuesOf(minimal([t, calc(["fld_t"])])).join()).toContain("only numbers");
    expect(issuesOf(minimal([n, calc([])])).join()).toContain("at least one question");
    expect(issuesOf(minimal([n, { ...calc(["fld_n"]), required: true }]))).not.toEqual([]);
  });
});
