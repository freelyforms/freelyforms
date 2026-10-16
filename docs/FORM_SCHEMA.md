# Versioned Form Schema

## Principle

The form schema is one of the project's most important assets. All clients and renderers should consume the same versioned model.

## Minimal conceptual structure

```json
{
  "schemaVersion": 1,
  "id": "frm_example",
  "title": "Contact us",
  "settings": {
    "mode": "classic",
    "submitLabel": "Send",
    "success": {
      "type": "message",
      "message": "Thanks — your response was received."
    }
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

## Initial field types

MVP:

- text;
- textarea;
- email;
- phone;
- number;
- date;
- select;
- radio;
- checkbox;
- multi-select;
- consent.

Next:

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
