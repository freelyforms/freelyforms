# 0017. Conditional field visibility

Date: 2026-10-18

## Status

Accepted.

## Context

Owners need to ask follow-up questions only when they apply ("If other, please specify", "Company size" only for business customers). The logic has to behave the same in the builder preview, the public form, the server and any future renderer, must never run code from a form definition (FORM_SCHEMA.md), and must keep the response sheet's columns stable. Multi-page forms and jumps come later and should be able to reuse the same conditions.

## Decision

- **Additive to schema version 1.** Any field may have `showIf`: `{ "match": "all" | "any", "rules": [ … ] }` with 1–10 rules. Each rule is `{ "field": "<field ID>", "op": "<operator>", "value"?: … }`. Forms without `showIf` are unchanged.
- **Only earlier fields.** A rule may refer only to a field that comes before it in the form, never to itself. This rules out cycles, matches how respondents read a form, and makes evaluation one pass from top to bottom. `parseForm` rejects unknown fields, later fields, operators the source field's type does not support, missing or ill-typed values, and option IDs the source field does not have.
- **Operators by source type** (values are compared after the same normalisation as validation: trimmed, case-insensitive for text):

  | Source field                                   | Operators                                                            | `value`      |
  | ---------------------------------------------- | -------------------------------------------------------------------- | ------------ |
  | `select`, `radio`                              | `equals`, `not_equals`                                               | an option ID |
  | `checkboxes`, `multiselect`                    | `contains`, `not_contains`                                           | an option ID |
  | `text`, `textarea`, `email`, `phone`, `hidden` | `equals`, `not_equals`, `contains`, `not_contains`                   | a string     |
  | `number`                                       | `equals`, `not_equals`, `greater_than`, `less_than`                  | a number     |
  | `date`                                         | `equals`, `not_equals`, `greater_than` (after), `less_than` (before) | an ISO date  |
  | every type                                     | `is_empty`, `is_not_empty` (for `consent`: not ticked / ticked)      | none         |

  Negative operators (`not_equals`, `not_contains`) are true when the source is empty.

- **One evaluator, shared.** `form-engine` evaluates visibility; `validateSubmission` uses it, and the public form's script uses the same code to show and hide fields as the respondent answers. A field whose source is not shown counts as empty, so hiding cascades.
- **What "not shown" means.** A field that is not shown is not validated (so `required` applies only when it is shown) and its answer is discarded on the server, even if the browser sent one. Its column stays in the sheet and the cell is left empty. Hidden-type fields can have conditions too: when false, no value is written.
- **Progressive enhancement.** The server renders every field; the script hides the ones whose conditions are false and disables their inputs so they are not sent. Without the script all fields are visible and the server still applies the conditions.
- **Builder.** "Show only if…" in a field's settings lists only earlier fields, and offers the operators and values (options of choice fields) of the chosen field. Deleting a field removes rules that refer to it; moving a field above its source shows the schema problem on the field until it is fixed.

## Consequences

- Conditions are data, portable with the JSON export and readable by other renderers.
- Owners see empty cells for questions a respondent was not shown, which is what they would expect in a spreadsheet.
- Pages and jumps (later) can use the same rule format with a different target.
- "Required only if…" and calculated values are separate features and need their own decision.
