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
- `settings` (all optional): `submitLabel`; `success`, either `{ type: "message", message }` or `{ type: "redirect", url }` with an `https://` address (a standalone form goes there after submitting; an embedded one asks the embed script to take the whole host page there, and shows a Continue link otherwise); and `theme` with `accent` (a `#rrggbb` colour) and `colorScheme` (`auto`, `light` or `dark`).

| Type          | Answer value                     | Type-specific properties                            |
| ------------- | -------------------------------- | --------------------------------------------------- |
| `text`        | string, single line              | `placeholder`, `minLength`, `maxLength`             |
| `textarea`    | string, line breaks kept as `\n` | `placeholder`, `minLength`, `maxLength`             |
| `email`       | string                           | `placeholder`                                       |
| `phone`       | string (5–15 digits)             | `placeholder`                                       |
| `number`      | number                           | `placeholder`, `min`, `max`, `integer`              |
| `date`        | ISO date `YYYY-MM-DD`            | `min`, `max`                                        |
| `select`      | one option ID                    | `options`                                           |
| `radio`       | one option ID                    | `options`                                           |
| `checkboxes`  | list of option IDs               | `options`, `minSelected`, `maxSelected`             |
| `multiselect` | list of option IDs               | `options`, `minSelected`, `maxSelected`             |
| `consent`     | `true`                           | the label is the statement the respondent agrees to |
| `hidden`      | string (at most 1,000 chars)     | `param`, `defaultValue`                             |

Every field also has `id`, `label` (at most 500 characters), optional `description` (2,000), optional `required` and optional `showIf` (see Conditions below). Placeholders are at most 200 characters, option labels 200, the form title 200, the form description 5,000 and the submit label 60. Cross-field rules: unique field and option IDs, `min` ≤ `max`, `minLength` ≤ `maxLength`, `minSelected` ≤ `maxSelected` and neither above the number of options.

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

Conditions are data, never code: no executable JavaScript in form definitions. Showing a field when earlier answers match (`showIf`, above) is implemented; the same rule format is meant for later targets:

```text
IF field A contains Y THEN require field C
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
