import { readFileSync } from "node:fs";
import { parseForm, type Field, type Form } from "@freelyforms/form-schema";
import { describe, expect, it } from "vitest";
import { validateSubmission, visibleFields, type ValidationResult } from "./index.js";

const loadFixture = (name: string): Form => {
  const url = new URL(`../../form-schema/fixtures/${name}.json`, import.meta.url);
  const result = parseForm(JSON.parse(readFileSync(url, "utf8")));
  if (!result.success) throw new Error(`fixture ${name} is invalid`);
  return result.form;
};

const one = (field: Field, raw: unknown): ValidationResult =>
  validateSubmission({ fields: [field] }, raw === undefined ? {} : { [field.id]: raw });

const errorOf = (field: Field, raw: unknown): string | undefined => {
  const result = one(field, raw);
  return result.ok ? undefined : result.errors[0]?.code;
};

const valueOf = (field: Field, raw: unknown): unknown => {
  const result = one(field, raw);
  if (!result.ok) throw new Error(`unexpected ${JSON.stringify(result.errors)}`);
  return result.values[field.id];
};

const text: Field = { id: "fld_t", type: "text", label: "T", maxLength: 5 };
const options = [
  { id: "opt_a", label: "A" },
  { id: "opt_b", label: "B" },
  { id: "opt_c", label: "C" },
];

describe("validateSubmission with fixtures", () => {
  it("accepts a complete contact submission and drops unknown keys", () => {
    const result = validateSubmission(loadFixture("contact"), {
      fld_name: "  Ada Lovelace ",
      fld_email: "ada@example.com",
      fld_message: "Hello there, world",
      fld_injected: "should be ignored",
      __proto__: { polluted: true },
    });
    expect(result).toEqual({
      ok: true,
      values: {
        fld_name: "Ada Lovelace",
        fld_email: "ada@example.com",
        fld_message: "Hello there, world",
      },
    });
  });

  it("reports every invalid field, not only the first", () => {
    const result = validateSubmission(loadFixture("contact"), { fld_email: "nope" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => `${e.fieldId}:${e.code}`)).toEqual([
      "fld_name:required",
      "fld_email:invalid_email",
      "fld_message:required",
    ]);
  });

  it("accepts a full all-fields submission", () => {
    const result = validateSubmission(loadFixture("all-fields"), {
      fld_name: "Grace",
      fld_email: "grace@example.org",
      fld_phone: "+61 (0)4 1234-5678",
      fld_guests: "2",
      fld_date: "2026-06-30",
      fld_ticket: "opt_vip",
      fld_sessions: ["opt_evening", "opt_morning"],
      fld_consent: "on",
    });
    expect(result).toEqual({
      ok: true,
      values: {
        fld_name: "Grace",
        fld_email: "grace@example.org",
        fld_phone: "+61 (0)4 1234-5678",
        fld_guests: 2,
        fld_date: "2026-06-30",
        fld_ticket: "opt_vip",
        fld_sessions: ["opt_morning", "opt_evening"],
        fld_consent: true,
        fld_utm_source: "direct",
      },
    });
  });
});

describe("hidden fields", () => {
  const hidden: Field = { id: "fld_src", type: "hidden", label: "Source", param: "utm_source" };
  const run = (field: Field, raw: unknown) =>
    validateSubmission({ fields: [field] }, { [field.id]: raw });

  it("keeps a value, with whitespace collapsed", () => {
    expect(run(hidden, "  news\nletter ")).toEqual({
      ok: true,
      values: { fld_src: "news letter" },
    });
  });
  it("never fails: unusable values are dropped or shortened", () => {
    expect(run(hidden, 42)).toEqual({ ok: true, values: {} });
    expect(run(hidden, ["a", "b"])).toEqual({ ok: true, values: { fld_src: "a" } });
    const long = run(hidden, "x".repeat(5_000));
    expect(long.ok && long.values.fld_src).toHaveLength(1_000);
  });
  it("falls back to the default value", () => {
    expect(run({ ...hidden, defaultValue: "direct" }, "")).toEqual({
      ok: true,
      values: { fld_src: "direct" },
    });
  });
});

describe("required and empty values", () => {
  const required: Field = { id: "fld_r", type: "text", label: "R", required: true };
  it.each([undefined, null, "", "   ", []])("treats %j as empty", (raw) => {
    expect(errorOf(required, raw)).toBe("required");
    expect(one({ ...required, required: false }, raw)).toEqual({ ok: true, values: {} });
  });
});

describe("text", () => {
  it("trims and collapses line breaks in single-line text", () => {
    expect(valueOf({ ...text, maxLength: 50 }, " a\r\n b ")).toBe("a b");
  });
  it("keeps line breaks in textarea, normalised to \\n", () => {
    expect(valueOf({ id: "fld_t", type: "textarea", label: "T" }, "a\r\nb")).toBe("a\nb");
  });
  it("counts code points, not UTF-16 units", () => {
    expect(valueOf(text, "😀😀😀😀😀")).toBe("😀😀😀😀😀");
    expect(errorOf(text, "😀😀😀😀😀😀")).toBe("too_long");
  });
  it("applies the default maximum when none is set", () => {
    expect(errorOf({ id: "fld_t", type: "text", label: "T" }, "x".repeat(1001))).toBe("too_long");
  });
  it("enforces minLength", () => {
    expect(one({ ...text, minLength: 3 }, "ab")).toEqual({
      ok: false,
      errors: [{ fieldId: "fld_t", code: "too_short", params: { min: 3 } }],
    });
  });
  it("rejects non-strings", () => {
    expect(errorOf(text, 42)).toBe("invalid_type");
    expect(errorOf(text, { toString: () => "x" })).toBe("invalid_type");
  });
  it("keeps formula-like text as plain text (written RAW later)", () => {
    expect(valueOf({ ...text, maxLength: 100 }, '=IMPORTXML("x")')).toBe('=IMPORTXML("x")');
  });
});

describe("email", () => {
  const email: Field = { id: "fld_e", type: "email", label: "E" };
  it.each(["a@b.co", "first.last+tag@sub.example.com"])("accepts %s", (v) => {
    expect(valueOf(email, ` ${v} `)).toBe(v);
  });
  it.each(["a@b", "a b@c.com", "@c.com", "a@.", `${"a".repeat(250)}@b.com`])("rejects %s", (v) => {
    expect(errorOf(email, v)).toBe("invalid_email");
  });
});

describe("phone", () => {
  const phone: Field = { id: "fld_p", type: "phone", label: "P" };
  it.each(["+1 415 555 2671", "(02) 9999 0000", "021-123-4567"])("accepts %s", (v) => {
    expect(valueOf(phone, v)).toBe(v);
  });
  it.each(["call me", "123", "+1 2345 6789 0123 4567", "555<script>"])("rejects %s", (v) => {
    expect(errorOf(phone, v)).toBe("invalid_phone");
  });
});

describe("number", () => {
  const number: Field = { id: "fld_n", type: "number", label: "N", min: 0, max: 10 };
  it.each([
    ["3", 3],
    [" 2.5 ", 2.5],
    [7, 7],
    [".5", 0.5],
  ])("accepts %j", (raw, expected) => {
    expect(valueOf(number, raw)).toBe(expected);
  });
  it.each(["1e3", "0x10", "abc", "1,5", Number.NaN, Infinity])("rejects %j", (raw) => {
    expect(errorOf(number, raw)).toBe("not_a_number");
  });
  it("enforces range and integer", () => {
    expect(errorOf(number, "-1")).toBe("too_small");
    expect(errorOf(number, "11")).toBe("too_large");
    expect(errorOf({ ...number, integer: true }, "1.5")).toBe("not_an_integer");
  });
});

describe("date", () => {
  const date: Field = { id: "fld_d", type: "date", label: "D", min: "2026-01-01" };
  it("accepts ISO calendar dates", () => {
    expect(valueOf(date, "2026-02-28")).toBe("2026-02-28");
  });
  it.each(["2026-02-30", "2026-13-01", "01/02/2026", "2026-1-1"])("rejects %s", (raw) => {
    expect(errorOf(date, raw)).toBe("invalid_date");
  });
  it("enforces min", () => {
    expect(errorOf(date, "2025-12-31")).toBe("too_small");
  });
});

describe("choices", () => {
  const radio: Field = { id: "fld_c", type: "radio", label: "C", options };
  const boxes: Field = {
    id: "fld_m",
    type: "checkboxes",
    label: "M",
    options,
    minSelected: 1,
    maxSelected: 2,
  };
  it("accepts a known option ID", () => {
    expect(valueOf(radio, "opt_b")).toBe("opt_b");
  });
  it("rejects labels and unknown IDs", () => {
    expect(errorOf(radio, "B")).toBe("invalid_option");
    expect(errorOf(radio, ["opt_a"])).toBe("invalid_type");
  });
  it("deduplicates and orders multi-choice answers by the form", () => {
    expect(valueOf(boxes, ["opt_b", "opt_a", "opt_b"])).toEqual(["opt_a", "opt_b"]);
    expect(valueOf(boxes, "opt_c")).toEqual(["opt_c"]);
  });
  it("enforces selection counts", () => {
    expect(errorOf(boxes, ["opt_a", "opt_b", "opt_c"])).toBe("too_many_selected");
    expect(errorOf({ ...boxes, minSelected: 2 }, ["opt_a"])).toBe("too_few_selected");
    expect(errorOf(boxes, ["opt_a", 1])).toBe("invalid_type");
    expect(errorOf(boxes, ["opt_z"])).toBe("invalid_option");
  });
});

describe("consent", () => {
  const consent: Field = { id: "fld_k", type: "consent", label: "I agree", required: true };
  it.each([true, "true", "on"])("accepts %j", (raw) => {
    expect(valueOf(consent, raw)).toBe(true);
  });
  it("requires consent when required", () => {
    expect(errorOf(consent, false)).toBe("required");
    expect(errorOf(consent, undefined)).toBe("required");
  });
  it("omits optional consent that was not given", () => {
    expect(one({ ...consent, required: false }, false)).toEqual({ ok: true, values: {} });
  });
  it("rejects other values", () => {
    expect(errorOf(consent, "yes please")).toBe("invalid_type");
  });
});

describe("conditional visibility (ADR 0017)", () => {
  const plan: Field = {
    id: "fld_plan",
    type: "radio",
    label: "Plan",
    options: [
      { id: "opt_personal", label: "Personal" },
      { id: "opt_business", label: "Business" },
    ],
  };
  const company: Field = {
    id: "fld_company",
    type: "text",
    label: "Company",
    required: true,
    showIf: { match: "all", rules: [{ field: "fld_plan", op: "equals", value: "opt_business" }] },
  };
  const vat: Field = {
    id: "fld_vat",
    type: "text",
    label: "VAT number",
    showIf: { match: "all", rules: [{ field: "fld_company", op: "is_not_empty" }] },
  };
  const form = { fields: [plan, company, vat] };

  it("requires a shown field and ignores a hidden one, dropping its answer", () => {
    expect(validateSubmission(form, { fld_plan: "opt_business" })).toMatchObject({
      ok: false,
      errors: [{ fieldId: "fld_company", code: "required" }],
    });
    expect(
      validateSubmission(form, { fld_plan: "opt_personal", fld_company: "Acme", fld_vat: "X1" }),
    ).toEqual({ ok: true, values: { fld_plan: "opt_personal" } });
  });

  it("cascades: a field depending on a hidden field is hidden too", () => {
    expect([...visibleFields(form, { fld_plan: "opt_business", fld_company: "Acme" })]).toEqual([
      "fld_plan",
      "fld_company",
      "fld_vat",
    ]);
    expect([...visibleFields(form, { fld_plan: "opt_personal", fld_company: "Acme" })]).toEqual([
      "fld_plan",
    ]);
  });

  const shownFor = (source: Field, op: string, value: unknown, raw: unknown) =>
    visibleFields(
      {
        fields: [
          source,
          {
            id: "fld_target",
            type: "text",
            label: "T",
            showIf: {
              match: "all",
              rules: [{ field: source.id, op, ...(value === undefined ? {} : { value }) }],
            },
          } as Field,
        ],
      },
      raw === undefined ? {} : { [source.id]: raw },
    ).has("fld_target");

  it.each([
    [{ id: "fld_s", type: "text", label: "S" }, "equals", "yes", " YES ", true],
    [{ id: "fld_s", type: "text", label: "S" }, "contains", "corp", "Acme Corp", true],
    [{ id: "fld_s", type: "text", label: "S" }, "not_contains", "corp", undefined, true],
    [{ id: "fld_s", type: "number", label: "S" }, "less_than", 18, "17", true],
    [{ id: "fld_s", type: "number", label: "S" }, "greater_than", 18, "18", false],
    [{ id: "fld_s", type: "date", label: "S" }, "greater_than", "2026-01-01", "2026-03-01", true],
    [
      { id: "fld_s", type: "checkboxes", label: "S", options },
      "contains",
      "opt_b",
      ["opt_a", "opt_b"],
      true,
    ],
    [
      { id: "fld_s", type: "checkboxes", label: "S", options },
      "not_contains",
      "opt_b",
      ["opt_a"],
      true,
    ],
    [{ id: "fld_s", type: "consent", label: "S" }, "is_not_empty", undefined, "on", true],
    [{ id: "fld_s", type: "consent", label: "S" }, "is_empty", undefined, undefined, true],
    [
      { id: "fld_s", type: "hidden", label: "S", defaultValue: "direct" },
      "equals",
      "direct",
      undefined,
      true,
    ],
    [{ id: "fld_s", type: "email", label: "S" }, "is_not_empty", undefined, "not-an-email", false],
  ] as [Field, string, unknown, unknown, boolean][])(
    "%o %s %o for %o → %s",
    (source, op, value, raw, expected) => {
      expect(shownFor(source, op, value, raw)).toBe(expected);
    },
  );

  it("matches any rule when asked to", () => {
    const either: Field = {
      id: "fld_either",
      type: "text",
      label: "E",
      showIf: {
        match: "any",
        rules: [
          { field: "fld_plan", op: "equals", value: "opt_personal" },
          { field: "fld_plan", op: "is_empty" },
        ],
      },
    };
    expect(visibleFields({ fields: [plan, either] }, {}).has("fld_either")).toBe(true);
    expect(
      visibleFields({ fields: [plan, either] }, { fld_plan: "opt_business" }).has("fld_either"),
    ).toBe(false);
  });
});
