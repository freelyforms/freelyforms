# 0020. Answer formats instead of regular expressions

Date: 2026-10-18

## Status

Accepted.

## Context

Owners want to check the shape of short answers: an order number like `AB-1234`, a postcode, digits only. Regular expressions are the usual tool, but a form definition would then carry patterns that can take exponential time on crafted input (ReDoS) in a Worker with a 10 ms CPU budget, and most owners can't write or read them.

## Decision

- A `text` field may have `match`: `{ "kind": …, "mask"?: …, "message"?: … }`. `kind` is one of `digits`, `letters`, `alphanumeric`, `url` or `mask`.
- A **mask** describes the whole answer, one character at a time: `9` is a digit, `A` a letter (any script), `*` a letter or digit, `\` makes the next character literal, and every other character must appear as written (letters compare case-insensitively). `mask` is required with `kind: "mask"` and not allowed otherwise; at most 100 characters.
- `url` accepts an `http://` or `https://` address with a host.
- Checks run in `form-engine` in one linear pass, after trimming and the length limits, with error code `invalid_format`. The message is the owner's `message` (up to 200 characters) or a default for the kind ("Use the format AA-9999 (9 = digit, A = letter)").
- No arbitrary regular expressions in form definitions.

## Consequences

- Validation stays fast and predictable on the server and in the browser.
- Formats that a mask can't express (alternatives, optional parts) need a later, equally safe extension rather than regular expressions.
