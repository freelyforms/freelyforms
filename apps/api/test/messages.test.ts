import { describe, expect, it } from "vitest";
import { errorMessage } from "../src/public/messages.js";

describe("answer format messages (ADR 0020)", () => {
  const msg = (params: Record<string, string>) =>
    errorMessage({ fieldId: "fld_x", code: "invalid_format", params });

  it("explains a mask with a legend for the symbols it uses", () => {
    expect(msg({ kind: "mask", mask: "AA-9999" })).toBe(
      "Use the format AA-9999 (9 = digit, A = letter).",
    );
    expect(msg({ kind: "mask", mask: "\\A-99" })).toBe("Use the format A-99 (9 = digit).");
  });

  it("prefers the owner's own message", () => {
    expect(msg({ kind: "digits", message: "Your 6-digit code" })).toBe("Your 6-digit code");
    expect(msg({ kind: "digits" })).toBe("Use digits only.");
  });
});
