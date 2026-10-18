# 0019. Questions required only under conditions

Date: 2026-10-18

## Status

Accepted. Extends [ADR 0017](0017-conditional-field-visibility.md).

## Context

Some questions must be answered only in some cases: a phone number when the respondent asks to be called, a reason when they answer "No". Hiding the question (ADR 0017) is wrong when it should stay visible and optional otherwise.

## Decision

- A field may have `requiredIf`, with exactly the same shape and rules as `showIf` (`match`, 1–10 rules on earlier answer fields). The schema checks its rules the same way and reports problems as "Required only if: …".
- A field is required when `required` is true, or when it is shown and its `requiredIf` holds for the answers above it. `required` and `requiredIf` can't be set together; hidden fields and page breaks can't have `requiredIf`.
- The shared evaluator in `form-engine` decides it in the same top-to-bottom pass as visibility; `requiredFields(form, answers)` lists the fields that must be answered now. The server's validation is authoritative.
- The public form renders a hidden required marker for such fields; the script shows it and sets `aria-required` while the conditions hold. Without the script there is no marker, and the server still enforces the rule and explains the error.
- In the builder, "+ Required only if…" appears when Required is unticked; ticking Required removes the conditions.

## Consequences

- One rule format now drives showing and requiring; later targets (page jumps, calculated values) can reuse it.
- An answer given to a field that is not required is still validated (a malformed phone number is still an error).
