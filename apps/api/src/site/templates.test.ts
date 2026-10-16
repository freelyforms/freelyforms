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

  it("has unique slugs and titles", () => {
    expect(new Set(TEMPLATES.map((t) => t.slug)).size).toBe(TEMPLATES.length);
    expect(new Set(TEMPLATES.map((t) => t.title)).size).toBe(TEMPLATES.length);
  });
});
