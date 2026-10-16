import { describe, expect, it } from "vitest";
import { FORM_SCHEMA_VERSION } from "./index.js";

describe("form-schema", () => {
  it("starts at schema version 1", () => {
    expect(FORM_SCHEMA_VERSION).toBe(1);
  });
});
