# 0018. Multi-page forms

Date: 2026-10-18

## Status

Accepted. Builds on [ADR 0017](0017-conditional-field-visibility.md).

## Context

Long forms are easier to complete a few questions at a time, with a sense of progress, and some pages apply only to some respondents. Pages must not change the response sheet, must keep one form definition for every renderer, and must keep working without JavaScript.

## Decision

- **A page break is an item in `fields`.** The new type `page` starts a new page; its `label` is the page title and its optional `description` is shown under it. Everything after it, up to the next page break, is on that page; the fields before the first page break form the first page, titled by the form. Additive to schema version 1.
- **Not an answer.** A page break has no value, no sheet column and cannot be `required`; conditions cannot test it. `answerFields(form)` (in `form-schema`) is the list of fields that have answers and columns, and everything that touches answers or columns uses it. A page break can't be the first or the last item, and two page breaks can't follow each other (no empty pages).
- **Skipping pages.** A page break may have `showIf`. When it is false, the whole page is skipped: its fields are treated as not shown (not validated, answers dropped), exactly as ADR 0017 defines for single fields. The evaluator walks the form once, so a page's condition can use any answer above it.
- **Respondent experience.** The script shows one page at a time with Back and Next, and "Page 2 of 4" counting only the pages that apply. Next checks the current page with the shared validator and moves focus to the first problem, or to the new page's title. The submit button and the Turnstile check are on the last page; Back keeps answers. When answers change which pages apply, the count updates.
- **Without JavaScript** every page is shown in sequence on one page with its title as a heading, and the server applies all conditions, as in ADR 0017.
- **Builder.** "Page break" in the palette; its card edits the page title and description, and "Show this page only if…" uses the same conditions editor. The preview pages like the public form.

## Consequences

- Pages need no new storage, no API change and no sheet change; old forms are unaffected.
- Reordering fields can move a question to another page, which is what owners expect from page breaks in other builders.
- A future conversational renderer can treat each field as its own step and ignore page breaks, or honour them as section titles.
- Saving progress between pages is not part of this decision; answers live only in the browser until submit.
