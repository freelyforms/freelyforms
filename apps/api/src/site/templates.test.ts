import { parseForm } from "@freelyforms/form-schema";
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "./templates.js";

describe("website templates", () => {
  it.each(TEMPLATES.map((t) => [t.slug, t] as const))(
    "%s is a valid form with complete copy",
    (_, t) => {
      const parsed = parseForm(t.form);
      expect(parsed.success ? [] : parsed.issues).toEqual([]);
      for (const field of t.form.fields) expect(t.why[field.id], field.id).toBeTruthy();
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
      expect(t.description.length).toBeLessThanOrEqual(160);
      expect(t.pitfalls.length).toBeGreaterThan(0);
    },
  );

  it("has unique slugs, names, titles and descriptions", () => {
    for (const key of ["slug", "name", "title", "description"] as const) {
      expect(new Set(TEMPLATES.map((t) => t[key])).size, key).toBe(TEMPLATES.length);
    }
  });

  it("gives every template a field set that differs from its siblings", () => {
    // Field IDs name what a field asks (fld_email, fld_budget), so shared IDs mean shared questions.
    const sets = TEMPLATES.map((t) => new Set(t.form.fields.map((f) => f.id)));
    const jaccard = (a: Set<string>, b: Set<string>) => {
      const shared = [...a].filter((x) => b.has(x)).length;
      return shared / (a.size + b.size - shared);
    };
    for (const [i, a] of sets.entries()) {
      for (const [j, b] of sets.entries()) {
        if (j <= i) continue;
        const pair = `${TEMPLATES[i]?.slug ?? ""} / ${TEMPLATES[j]?.slug ?? ""}`;
        expect(jaccard(a, b), pair).toBeLessThanOrEqual(0.7);
      }
    }
  });
});
