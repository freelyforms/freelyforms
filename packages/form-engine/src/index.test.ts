import { describe, expect, it } from "vitest";
import { FORM_SCHEMA_VERSION } from "@freelyforms/form-schema";
import { SUPPORTED_SCHEMA_VERSIONS } from "./index.js";

describe("form-engine", () => {
  it("supports the current schema version", () => {
    expect(SUPPORTED_SCHEMA_VERSIONS).toContain(FORM_SCHEMA_VERSION);
  });
});
