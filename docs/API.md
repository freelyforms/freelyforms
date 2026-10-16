# HTTP API (MVP)

The API is served by the `apps/api` Worker ([ADR 0012](adr/0012-single-worker-for-mvp.md)). It is an internal API for the Freely Forms web app, not yet a stable public API: paths and shapes may change before 1.0.

Conventions:

- JSON in and out unless stated otherwise.
- Owner endpoints need the session cookie `__Host-ff_session` and return `401 {"error":"unauthenticated"}` without it.
- Every non-`GET` request except public submissions must send an `Origin` header equal to the API origin, or it gets `403 {"error":"forbidden_origin"}`.
- Errors are `{"error": "<code>", ...details}`. A form that belongs to someone else is reported as `404 not_found`, never `403`.

## Auth

| Method and path             | Purpose                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/google/start`    | Starts Google sign-in. `?consent=1` forces the consent screen (used to grant Drive access later).                                       |
| `GET /auth/google/callback` | Google redirects here. On success the session cookie is set (30 days) and the browser goes to `/`; on failure to `/?auth_error=<code>`. |
| `GET /auth/me`              | `{ user: { id, email, name }, google: { status: "active" \| "revoked" \| "missing", driveAccess: boolean } }`                           |
| `POST /auth/logout`         | Ends the session; `303` to `/`.                                                                                                         |

## Forms (owner)

| Method and path                     | Body / result                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /forms`                        | `{ forms: [{ id, title, status, publishedVersion, updatedAt }] }`, newest first; archived forms are omitted.                                      |
| `POST /forms`                       | Body `{ title? }`. Creates an empty draft. `201` with the form view.                                                                              |
| `GET /forms/:id`                    | Form view: `{ id, title, status, publishedVersion, updatedAt, draft, destination: { state, url } \| null }`.                                      |
| `PUT /forms/:id/draft`              | Body: a full form document ([FORM_SCHEMA.md](FORM_SCHEMA.md)), at most 256 KB, with the same `id`. `422 invalid_form` lists path-tagged `issues`. |
| `POST /forms/:id/publish`           | Publishes the draft as a new immutable version. The first publish creates the response spreadsheet in the owner's Drive. See errors below.        |
| `GET /forms/:id/deliveries`         | `{ destination: { state } \| null, counts: { <deliveryState>: n } }` for delivery records of the last 30 days.                                    |
| `POST /forms/:id/deliveries/resume` | After the owner fixes the sheet: re-queues held deliveries, up to 100 per call. `{ resumed: n, more: boolean }`; call again while `more` is true. |
| `DELETE /forms/:id`                 | Archives the form (it stops accepting responses). `204`. The spreadsheet is never touched.                                                        |

Publish errors: `422 no_fields`, `422 invalid_form`, `409 google_access_required` (sign in again with Drive access), `409 destination_missing` (the sheet or tab is gone), `409 publish_conflict` (another publish of the same form won), `503 google_unavailable` (retry later).

Destination states: `OK`, `ACCESS_REVOKED`, `SHEET_DELETED`, `TAB_MISSING`, `COLUMN_MISSING`, `QUOTA` ([ADR 0005](adr/0005-sheet-is-externally-mutable.md)). Delivery states: `accepted`, `queued`, `delivering`, `delivered`, `retrying`, `unknown`, `blocked`, `permanently_failed` ([ADR 0003](adr/0003-delivery-states-and-reconciliation.md)).

## Public forms

Served at `https://freelyforms.link/<formId>` in production and at `/f/<formId>` in development. When a forms domain is configured, `/f/<formId>` on the app domain redirects to it.

| Method and path   | Purpose                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /f/:formId`  | The published form as accessible HTML (`noindex`, nonce CSP, embeddable).                                |
| `POST /f/:formId` | A submission. Accepts `application/x-www-form-urlencoded`, `multipart/form-data` (no files yet) or JSON. |

Submissions:

- Field values are keyed by field ID; multi-choice fields repeat the key (forms) or use an array (JSON). Choice answers are option IDs.
- With Turnstile enabled, include `cf-turnstile-response`.
- Body limit 64 KB. Rate limits: 20 per minute per IP, 5 per minute per IP and form.
- HTML clients get a success page, or the form again with errors (`422`) or a challenge notice (`403`).
- Clients that send `Accept: application/json` get `201 { ok: true, submissionId }`, `422 { error: "invalid", errors: [{ fieldId, code, params? }] }`, `403 challenge_failed`, `429 rate_limited` (with `Retry-After`), `413 too_large`, `400 invalid_body` or `404 not_found`.

A `201` means the response was accepted and queued, not that it is already in the sheet: delivery is asynchronous and usually takes seconds ([ARCHITECTURE.md](ARCHITECTURE.md)).

## Operations

`GET /health` → `{ ok, schemaVersion, db }`.
