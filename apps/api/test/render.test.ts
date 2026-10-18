import { parseForm, type Form } from "@freelyforms/form-schema";
import { describe, expect, it } from "vitest";
import { renderForm, themeCss } from "../src/public/render.js";

const form = (extra: Record<string, unknown>, fields: unknown[]): Form => {
  const parsed = parseForm({ schemaVersion: 1, id: "frm_render1", title: "T", ...extra, fields });
  if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
  return parsed.form;
};

describe("themes", () => {
  it("defaults to the system font, rounded corners and comfortable spacing", () => {
    const css = themeCss(undefined);
    expect(css).toContain("--font:system-ui,sans-serif");
    expect(css).toContain("--radius:8px");
    expect(css).toContain("--gap:24px");
  });

  it("applies font, corners and spacing from the theme", () => {
    const css = themeCss({ font: "serif", corners: "pill", density: "compact" });
    expect(css).toContain("--font:ui-serif");
    expect(css).toContain("--button-radius:999px");
    expect(css).toContain("--gap:14px");
    expect(css).not.toMatch(/https?:\/\//); // no font downloads
  });

  it("marks half-width fields so two can share a row", async () => {
    const definition = form({}, [
      { id: "fld_first", type: "text", label: "First name", width: "half" },
      { id: "fld_last", type: "text", label: "Last name", width: "half" },
      { id: "fld_note", type: "textarea", label: "Note" },
    ]);
    // Rendered HTML is an escaped string, possibly behind a promise.
    const page = String(await renderForm(definition, "", { nonce: "n" }));
    expect(page).toContain('class="field half" data-field="fld_first"');
    expect(page).toContain('class="field" data-field="fld_note"');
  });
});
