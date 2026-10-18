# 0022. Calculations and option scores

Date: 2026-10-18

## Status

Accepted. Builds on [ADR 0017](0017-conditional-field-visibility.md).

## Context

Quizzes, assessments and order forms need a number computed from answers: a score, a total, a count. Owners also want to branch on it ("if the score is above 10, show the advice page"). Like conditions, the calculation must be data, give the same result in every renderer and on the server, and never trust a value sent by the browser.

## Decision

- **Option scores.** An option of a choice field (`select`, `radio`, `checkboxes`, `multiselect`) may have `score`, a number from −1,000,000 to 1,000,000.
- **A `calculation` field** has `sum`: 1–50 IDs of earlier fields of type `number`, `rating`, `scale`, a choice type or another `calculation`, and optional `show`. Its value is the sum of those fields' numbers: the answer for number, rating and scale, the chosen options' scores for choices (options without a score count 0), the value of an earlier calculation. Fields that are empty or not shown add 0. The result is rounded to 6 decimal places.
- **Server-computed.** `form-engine` computes it in the same top-to-bottom pass as visibility, after the fields it sums, so later conditions can test it (number operators). Whatever the browser sends for it is ignored. It is written to its own column as a number. It cannot be `required` and has no `requiredIf`; it can have `showIf` (when not shown it has no value).
- **Display.** With `show: true` the public form shows the label and the running result (an `<output>` updated by the form script; the server's value is the one that counts). Otherwise respondents don't see it.
- **Jumps** are expressed with conditions on pages (ADR 0018) that test answers or calculations; no separate jump rules.

## Consequences

- Scores and totals need no code in form definitions and work offline in the browser and on the server alike.
- Products other than sums (multiplication, minimum, formulas) can be added later as other calculation kinds with the same guarantees.
