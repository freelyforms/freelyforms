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
- `settings` (all optional): `submitLabel`, `success` message, and `theme` with `accent` (a `#rrggbb` colour) and `colorScheme` (`auto`, `light` or `dark`).

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

Every field also has `id`, `label` (at most 500 characters), optional `description` (2,000) and optional `required`. Placeholders are at most 200 characters, option labels 200, the form title 200, the form description 5,000 and the submit label 60. Cross-field rules: unique field and option IDs, `min` ≤ `max`, `minLength` ≤ `maxLength`, `minSelected` ≤ `maxSelected` and neither above the number of options.

The theme's `accent` colour replaces the accent in both the light and dark palettes; text on accent-coloured buttons is black or white, whichever contrasts more.

Answers to choice fields are option IDs, so renaming an option label never breaks logic or history; the delivery worker writes the label from the form version the response was submitted against.

## Answer validation

`packages/form-engine` exports `validateSubmission(form, answers)`. It has no runtime dependencies so the same code can run in the browser; today it runs on the server, where its result is authoritative, and client-side validation is still to come. It:

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
- hidden field;
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

Support conditions such as:

```text
IF field A equals X THEN show field B
IF field A contains Y THEN require field C
IF score > N THEN jump to page Z
```

Do not use arbitrary executable JavaScript in form definitions.

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
