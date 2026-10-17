import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GENERATED_PATH, generatedSource } from "../scripts/build-form-client.js";

describe("public form browser script", () => {
  it("is up to date with its source (run pnpm --filter @freelyforms/api build:client)", async () => {
    expect(readFileSync(GENERATED_PATH, "utf8")).toBe(await generatedSource());
  });
});
