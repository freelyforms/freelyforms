# 0023. Matrix and ranking fields

Date: 2026-10-18

## Status

Accepted.

## Context

Surveys need grids ("rate each of these on the same scale") and rankings ("order these by importance"). Both take several inputs for one question. They must work without JavaScript, with a keyboard and a screen reader, keep one sheet column per field (ADR 0004), and keep answers in the existing value types.

## Decision

- **`matrix`**: `rows` (1–20 `{ id, label }`, IDs `row_…`) and `columns` (2–10 options, which may carry `score`, ADR 0022). Each row is a group of radio buttons named `<fieldId>.<rowId>`. The answer is a list of column IDs in row order, `""` for a row left blank. `required` means every row answered; an optional matrix may be partly answered. The sheet cell reads `Row: Column; Row: Column`. Calculations add the chosen columns' scores.
- **`ranking`**: `options` (2–10). Each option has a position select named `<fieldId>.<optionId>` (1 to n). The answer is the option IDs in ranked order. Positions must be all different and either all given or (for an optional field) none. The sheet cell reads `1. A, 2. B, 3. C`.
- `form-engine` gathers the `<fieldId>.<part>` inputs into one answer before validating, so the browser and the server read them the same way. Conditions can test both only with `is_empty` / `is_not_empty`. Neither is prefilled from links.
- No drag and drop: selects and radio grids work everywhere; a richer ranking widget can enhance the same inputs later.

## Consequences

- One column per field stays true, at the cost of a combined cell; owners who need one column per row can use separate questions.
- New error codes: `incomplete` (matrix rows or ranking positions missing) and `duplicate_rank`.
