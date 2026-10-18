# Versioned Form Schema

## Principle

The form schema is one of the project's most important assets. All clients and renderers should consume the same versioned model.

## Example

```json
{
  "schemaVersion": 1,
  "id": "frm_example1",
  "title": "Contact us",
  "settings": {
    "submitLabel": "Send",
    "success": {
      "type": "message",
      "message": "Thanks — your response was received."
    },
    "theme": { "accent": "#1f5fd6", "colorScheme": "auto" }
  },
  "fields": [
    {
      "id": "fld_name",
      "type": "text",
      "label": "Name",
      "required": true
    },
    {
      "id": "fld_email",
      "type": "email",
      "label": "Email",
      "required": true
    }
  ]
}
```

## Schema version 1 (implemented)

Source of truth: `packages/form-schema` (TypeScript types and `parseForm`). A generated JSON Schema (draft 2020-12) is committed at `packages/form-schema/form-v1.schema.json`; cross-field rules (unique IDs, `min` ≤ `max`) are enforced by `parseForm` only. Example definitions live in `packages/form-schema/fixtures/`.

Rules:

- unknown properties are rejected, never silently dropped;
- form IDs match `frm_[A-Za-z0-9]{6,32}`, field IDs `fld_[a-z0-9_]{1,48}`, option IDs `opt_[a-z0-9_]{1,48}`;
- at most 200 fields per form and 500 options per choice field;
- text limits never exceed 50,000 characters (the Google Sheets cell limit); defaults are 1,000 for `text` and 10,000 for `textarea`.
- `settings` (all optional): `submitLabel`; `mode`, `classic` (default) or `conversational` (the public form's script shows one question at a time with Back, Next and "Question 3 of 9"; page break titles show with the first question of their page; without the script all questions show); `success`, either `{ type: "message", message }` or `{ type: "redirect", url }` with an `https://` address (a standalone form goes there after submitting; an embedded one asks the embed script to take the whole host page there, and shows a Continue link otherwise); and `theme` with `accent` (a `#rrggbb` colour), `colorScheme` (`auto`, `light` or `dark`), `font` (`system`, `serif`, `rounded` or `mono`: system font stacks, nothing is downloaded), `corners` (`square`, `rounded` or `pill`) and `density` (`comfortable` or `compact`).

| Type          | Answer value                                       | Type-specific properties                                                                                             |
| ------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `text`        | string, single line                                | `placeholder`, `minLength`, `maxLength`, `match`                                                                     |
| `textarea`    | string, line breaks kept as `\n`                   | `placeholder`, `minLength`, `maxLength`                                                                              |
| `email`       | string                                             | `placeholder`                                                                                                        |
| `phone`       | string (5–15 digits)                               | `placeholder`                                                                                                        |
| `number`      | number                                             | `placeholder`, `min`, `max`, `integer`                                                                               |
| `date`        | ISO date `YYYY-MM-DD`                              | `min`, `max`                                                                                                         |
| `select`      | one option ID                                      | `options`                                                                                                            |
| `radio`       | one option ID                                      | `options`                                                                                                            |
| `checkboxes`  | list of option IDs                                 | `options`, `minSelected`, `maxSelected`                                                                              |
| `multiselect` | list of option IDs                                 | `options`, `minSelected`, `maxSelected`                                                                              |
| `consent`     | `true`                                             | the label is the statement the respondent agrees to                                                                  |
| `hidden`      | string (at most 1,000 chars)                       | `param`, `defaultValue`                                                                                              |
| `page`        | none (a page break, no column)                     | `description` (shown under the page title)                                                                           |
| `rating`      | whole number from 1 to `max`                       | `max` (3–10, default 5): stars                                                                                       |
| `scale`       | whole number from `min` to `max`                   | `min` (0 or 1, default 1), `max` (2–10, default 5), `minLabel`, `maxLabel` (0–10 is NPS)                             |
| `calculation` | number, computed by the server                     | `sum` (1–50 earlier number, rating, scale, choice or calculation field IDs), `show` (display the running result)     |
| `matrix`      | list of column IDs, one per row (`""` if blank)    | `rows` (1–20 `{ id: "row_…", label }`), `columns` (2–10 options, may have `score`); inputs named `<fieldId>.<rowId>` |
| `ranking`     | list of option IDs, best first                     | `options` (2–10); each has a place select named `<fieldId>.<optionId>`; places all different                         |
| `file`        | list of `<fileId>:<token>` (one per uploaded file) | `accept` (`any`, `images`, `documents`), `maxSizeMb` (1–25, default 10), `maxFiles` (1–5, default 1)                 |

Every field also has `id`, `label` (at most 500 characters), optional `description` (2,000), optional `required`, optional `showIf` and optional `requiredIf` (see Conditions below), and optional `width` (`full` or `half`: two half-width fields share a row on screens wider than 560px). Placeholders are at most 200 characters, option labels 200, the form title 200, the form description 5,000 and the submit label 60. Cross-field rules: unique field and option IDs, `min` ≤ `max`, `minLength` ≤ `maxLength`, `minSelected` ≤ `maxSelected` and neither above the number of options.

A `hidden` field is not shown to respondents; its label is the column name in the sheet. Its value comes from the form link's query parameter `param` (default: the field ID), or, in an embed, from the same parameter in the address of the host page (the embed script passes only the parameter names the form asks for), or else `defaultValue`. It can't be `required`. Respondents can change it, so it is for attribution such as UTM tags, never for trust; validation never fails on it (unusable values are dropped, long ones shortened). The builder's "UTM tracking" adds hidden fields for `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` and `utm_content`.

### Conditions (`showIf`)

Any field can be shown only when answers above it meet conditions ([ADR 0017](adr/0017-conditional-field-visibility.md)):

```json
{
  "schemaVersion": 1,
  "id": "frm_example2",
  "title": "Sign up",
  "fields": [
    {
      "id": "fld_plan",
      "type": "radio",
      "label": "Plan",
      "required": true,
      "options": [
        { "id": "opt_personal", "label": "Personal" },
        { "id": "opt_business", "label": "Business" }
      ]
    },
    {
      "id": "fld_company",
      "type": "text",
      "label": "Company name",
      "required": true,
      "showIf": {
        "match": "all",
        "rules": [{ "field": "fld_plan", "op": "equals", "value": "opt_business" }]
      }
    }
  ]
}
```

- `match` is `all` or `any`; 1–10 `rules`, each testing one field **above** this one (never itself or a later field).
- Operators depend on the tested field: `equals`/`not_equals` (choice: an option ID; text: case-insensitive; number; date), `contains`/`not_contains` (text: case-insensitive substring; checkboxes and multi-select: an option ID), `greater_than`/`less_than` (number; date: after/before), `is_empty`/`is_not_empty` (any field; for consent: not ticked / ticked, with no `value`). `not_equals` and `not_contains` hold when the tested field is empty.
- A field that is not shown is not validated (its `required` applies only when shown), and its answer is dropped on the server even if one is sent; its cell in the sheet stays empty. A field that depends on a field that is not shown sees it as empty, so hiding cascades.
- The public form hides and disables such fields as the respondent answers, with the same evaluator (`visibleFields` in `form-engine`); without JavaScript every field is shown and the server applies the conditions.

### Required only if (`requiredIf`)

`requiredIf` has the same shape and rules as `showIf`, and makes a shown field required only while its conditions hold ([ADR 0019](adr/0019-conditional-required.md)). It can't be combined with `required`, and hidden fields and page breaks can't have it. The public form shows the required marker and sets `aria-required` while it applies; the server enforces it either way.

### Answer formats (`match`)

A `text` field can require a shape ([ADR 0020](adr/0020-answer-formats.md)): `{ "kind": "digits" | "letters" | "alphanumeric" | "url" }`, or `{ "kind": "mask", "mask": "AA-9999" }` where `9` is a digit, `A` a letter, `*` a letter or digit, `\` makes the next character literal and every other character must match as written (letters case-insensitively). An optional `message` (up to 200 characters) replaces the default error text. There are no regular expressions in form definitions; every check is linear in the answer's length. Error code: `invalid_format`.

### Calculations and scores

Options of choice fields may have a `score` (a number). A `calculation` field adds up its `sum` fields ([ADR 0022](adr/0022-calculations-and-scores.md)): numbers, ratings and scales add their value, choices the scores of the chosen options, earlier calculations their result; empty or hidden fields add 0. The server computes it (anything the browser sends for it is ignored) and writes it to its own column; conditions can test it like a number, which is how pages are skipped by score. With `show: true` respondents see the running result.

### Matrix and ranking

A `matrix` asks the same question for several rows; a `ranking` puts options in order ([ADR 0023](adr/0023-matrix-and-ranking.md)). Each has one input per row or option, named `<fieldId>.<part>`, which `form-engine` gathers into one answer (API clients may send the list under the field ID instead). A required matrix needs every row; a ranking needs every place, all different, or (when optional) none. Each is one sheet cell: `Row: Column; Row: Column` or `1. A, 2. B`. Conditions can test them with `is_empty` / `is_not_empty`; a calculation adds a matrix's column scores. Error codes: `incomplete`, `duplicate_rank`.

### File uploads

A `file` field lets respondents upload files straight to the owner's Google Drive ([ADR 0007](adr/0007-direct-resumable-drive-uploads.md)); it needs the form script. For each file the browser gets an upload slot from `POST /f/:formId/uploads`, sends the bytes to Google and puts `<fileId>:<token>` in the answer. The delivery checks each file in Drive (it must carry the form's, field's and slot's tags and fit the size and type) and writes `name – link` per file to the cell, or `(file not accepted)`. Files never sent with a response are deleted after a day. Conditions can test the field with `is_empty` / `is_not_empty`.

### Pages

A `page` item is a page break ([ADR 0018](adr/0018-multi-page-forms.md)): the questions after it, up to the next break, form a page titled by its `label`; the questions before the first break form the first page. It has no answer and no sheet column (`answerFields(form)` lists the fields that do), can't be `required`, and conditions can't test it. It can't be first or last, and two can't follow each other. With `showIf` the whole page is skipped when its conditions fail, and its questions count as not shown. The public form shows one page at a time with Back, Next and "Page 2 of 3" (counting only pages that apply); Next checks the current page. Without JavaScript all pages appear in sequence.

### Prefilled links

A form link can suggest answers: `?fld_email=ada@example.com` fills a field by its ID; choice fields accept an option ID or its label, and repeating the parameter selects several options. Consent is never prefilled. Prefilled values are submitted and validated like typed ones. Avoid putting personal data in shared links: URLs end up in browser history and server logs.

The theme's `accent` colour replaces the accent in both the light and dark palettes; text on accent-coloured buttons is black or white, whichever contrasts more.

Answers to choice fields are option IDs, so renaming an option label never breaks logic or history; the delivery worker writes the label from the form version the response was submitted against.

## Answer validation

`packages/form-engine` exports `validateSubmission(form, answers)`. It has no runtime dependencies, so the same code runs in the browser and on the server. The public form page inlines a small script bundled from it (`apps/api/src/public/client/form.ts`, generated into `client.generated.ts` by `pnpm --filter @freelyforms/api build:client`; a test fails when the bundle is stale) that checks answers before sending, with the same error messages as the server. The server's result is authoritative, and the form still works without the script. It:

- trims text, collapses line breaks in single-line text and counts length in Unicode code points;
- converts numbers sent as strings, rejects exponents, hex and locale formats;
- returns choice answers deduplicated and in the order of the form's options;
- ignores keys that are not field IDs of the form;
- reports every invalid field with a stable error code (`required`, `too_long`, `invalid_email`, `invalid_option`, …) and parameters; human-readable messages are produced by the renderer.

## Planned field types

- address;
- rating;
- scale;
- matrix;
- ranking;
- file upload;
- signature;
- currency;
- calculated field;
- section/content block.

## Schema rules

- IDs are immutable once published.
- Labels may change without changing IDs.
- storage column mapping must use stable field IDs internally;
- display names in Sheets can be human-friendly while retaining a hidden/stable mapping strategy;
- deleted fields should not silently remap old data;
- schema migrations must be explicit;
- conditional logic references stable IDs, never labels.

## Logic model

Conditions are data, never code: no executable JavaScript in form definitions. Showing a field (`showIf`), requiring it (`requiredIf`) and skipping a page (`showIf` on a page break) are implemented with one rule format, meant for later targets too:

```text
IF score > N THEN jump to page Z
```

## Validation

Schema must support both declarative built-in validators and safe parameterised rules.

## Renderer independence

A valid schema should render in:

- classic web renderer;
- conversational renderer;
- embed;
- preview;
- future mobile renderer;
- accessible no-animation mode.
