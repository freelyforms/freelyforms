import type { FieldError } from "@freelyforms/form-engine";

/** Error texts for validation codes; shared by the server-rendered form and its browser script. */
const MESSAGES: Record<string, (p: Record<string, number | string>) => string> = {
  required: () => "This field is required.",
  invalid_type: () => "This value is not valid.",
  too_short: (p) => `Enter at least ${String(p.min)} characters.`,
  too_long: (p) => `Enter at most ${String(p.max)} characters.`,
  invalid_email: () => "Enter a valid email address.",
  invalid_phone: () => "Enter a valid phone number.",
  not_a_number: () => "Enter a number.",
  not_an_integer: () => "Enter a whole number.",
  too_small: (p) => `Enter ${String(p.min)} or more.`,
  too_large: (p) => `Enter ${String(p.max)} or less.`,
  invalid_date: () => "Enter a valid date.",
  invalid_option: () => "Choose one of the options.",
  too_few_selected: (p) => `Choose at least ${String(p.min)}.`,
  too_many_selected: (p) => `Choose at most ${String(p.max)}.`,
  invalid_format: (p) => (typeof p.message === "string" ? p.message : formatHint(p)),
};

/** The default explanation of an answer format (ADR 0020), e.g. for a mask `AA-9999`. */
function formatHint(p: Record<string, number | string>): string {
  switch (p.kind) {
    case "digits":
      return "Use digits only.";
    case "letters":
      return "Use letters only.";
    case "alphanumeric":
      return "Use letters and digits only.";
    case "url":
      return "Enter a web address starting with https://.";
  }
  const mask = String(p.mask ?? "");
  const shown = mask.replace(/\\(.)/g, "$1");
  const legend = [
    /(^|[^\\])9/.test(mask) ? "9 = digit" : "",
    /(^|[^\\])A/.test(mask) ? "A = letter" : "",
    /(^|[^\\])\*/.test(mask) ? "* = letter or digit" : "",
  ].filter(Boolean);
  return `Use the format ${shown}${legend.length ? ` (${legend.join(", ")})` : ""}.`;
}

export const errorMessage = (e: FieldError) =>
  (MESSAGES[e.code] ?? MESSAGES.invalid_type)?.(e.params ?? {}) ?? "";
