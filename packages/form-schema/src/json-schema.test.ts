import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formJsonSchema } from "./index.js";

const target = new URL("../form-v1.schema.json", import.meta.url);

describe("form-v1.schema.json", () => {
  it("matches the Zod schema (run `pnpm --filter @freelyforms/form-schema generate` to update)", () => {
    const { $schema, ...rest } = formJsonSchema();
    const generated = `${JSON.stringify(
      {
        $schema,
        $id: "https://freelyforms.com/schema/form-v1.schema.json",
        title: "Freely Forms form definition, schema version 1",
        ...rest,
      },
      null,
      2,
    )}\n`;
    if (process.env.UPDATE_JSON_SCHEMA === "1") writeFileSync(target, generated);
    expect(readFileSync(target, "utf8")).toBe(generated);
  });
});
