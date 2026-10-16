# Engineering Principles

## 1. Schema first

Business logic operates on a versioned schema, not on UI component state.

## 2. Central DB is metadata, not the user's response warehouse

Do not casually add submission-answer columns/tables to the core database.

## 3. Reliable delivery beats clever infrastructure

A response accepted by the service must either reach its destination or create a visible actionable failure state.

## 4. Edge-friendly, not edge-dependent

Core packages should remain portable.

## 5. One codebase, multiple renderers

Classic and conversational modes share validation, logic and schema.

## 6. Accessibility is a feature

Keyboard operation, labels, focus states, reduced motion, errors and screen-reader behaviour are part of definition-of-done.

## 7. Public forms must be fast

Minimise client JavaScript and third-party dependencies on the respondent path.

## 8. Open-source quality

A third-party developer should be able to understand, run and contribute to the project.

## 9. No silent destructive schema changes

User-owned Sheets may be edited manually. Detect conflicts; do not overwrite surprising changes blindly.

## 10. Avoid premature platform sprawl

Do not build CRM, email marketing, spreadsheet UI or BI features that existing ecosystem tools already solve well.
