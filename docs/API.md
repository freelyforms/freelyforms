# HTTP API (MVP)

The API is served by the `apps/api` Worker ([ADR 0012](adr/0012-single-worker-for-mvp.md)). It is an internal API for the Freely Forms web app, not yet a stable public API: paths and shapes may change before 1.0.

Conventions:

- JSON in and out unless stated otherwise.
- Owner endpoints need the session cookie `__Host-ff_session` and return `401 {"error":"unauthenticated"}` without it.
- Every non-`GET` request except public submissions must send an `Origin` header equal to the API origin, or it gets `403 {"error":"forbidden_origin"}`.
- Errors are `{"error": "<code>", ...details}`. A form that belongs to someone else is reported as `404 not_found`, never `403`.

## Auth

| Method and path             | Purpose                                                                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/google/start`    | Starts Google sign-in. `?consent=1` forces the consent screen (used to grant Drive access later).                                                                                                                                               |
| `GET /auth/google/callback` | Google redirects here. On success the session cookie is set (30 days) and the browser goes to `/app/`; on failure to `/app/?auth_error=<code>`. When Google returns no refresh token and none is stored, it restarts sign-in with `?consent=1`. |
| `GET /auth/me`              | `{ user: { id, email, name }, google: { status: "active" \| "revoked" \| "missing", driveAccess: boolean } }`                                                                                                                                   |
| `POST /auth/logout`         | Ends the session; `303` to `/app/`.                                                                                                                                                                                                             |

## Account

| Method and path                   | Purpose                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /account/google/disconnect` | Revokes the Google grant at Google (best effort) and deletes the stored token. `{ disconnected: true, revokedAtGoogle }`. Published forms keep accepting responses; they wait as blocked deliveries until Google is connected again.                                                                                                      |
| `GET /account/google/picker`      | For Google Picker: `{ accessToken, expiresAt, apiKey, appId }` (a short-lived access token, never the refresh token). `503 picker_unavailable` when the server has no Picker key, `409 google_access_required` without Drive access.                                                                                                      |
| `DELETE /account`                 | Body `{ confirm: "<account email>" }`. Revokes Google access, removes the custom domain from Cloudflare, deletes held deliveries and all metadata (sessions, forms, versions, destinations, delivery records). Never touches the owner's Sheets or Drive files. `422 confirmation_required` otherwise.                                    |
| `GET /domain`                     | The owner's custom domain (ADR 0025): `{ available, target, domain: { hostname, status, detail, checkedAt } \| null }`. `status` is `pending`, `active` or `failed`; a pending one is checked with Cloudflare again when at least 15 s old. `{ available: false, domain: null }` when the deployment has no Cloudflare for SaaS settings. |
| `PUT /domain`                     | Body `{ hostname }` (a scheme and trailing slash are ignored). Registers it with Cloudflare; `201`. `422 invalid_hostname \| hostname_not_allowed \| hostname_rejected`, `409 domain_exists \| hostname_taken`, `502 cloudflare_unavailable`.                                                                                             |
| `DELETE /domain`                  | Removes the domain from Cloudflare and here. `502 cloudflare_unavailable` if Cloudflare can't be reached (nothing is removed).                                                                                                                                                                                                            |

## Forms (owner)

| Method and path                            | Body / result                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /forms`                               | `{ forms: [{ id, title, status, publishedVersion, updatedAt, needsAttention }] }`, newest first; archived forms are omitted. `needsAttention` is true when the sheet is unreachable or responses are on hold.                                                                                                                   |
| `POST /forms`                              | Body `{ title? }`. Creates an empty draft. `201` with the form view.                                                                                                                                                                                                                                                            |
| `GET /forms/:id`                           | Form view: `{ id, title, status, publishedVersion, updatedAt, draft, hasUnpublishedChanges, slug, public: { url, customUrl, embedCode } \| null, destination: { state, url } \| null }`.                                                                                                                                        |
| `GET /forms/:id/preview`                   | The draft rendered by the public renderer as HTML, for the builder's preview frame. Never submits; can be framed only by the app.                                                                                                                                                                                               |
| `PUT /forms/:id/draft`                     | Body: a full form document ([FORM_SCHEMA.md](FORM_SCHEMA.md)), at most 256 KB, with the same `id`. Returns the form view. Errors: `413 too_large`, `400 invalid_json`, `422 form_id_mismatch`, `422 invalid_form` with path-tagged `issues`.                                                                                    |
| `POST /forms/:id/publish`                  | Publishes the draft as a new immutable version and returns the form view. The first publish creates the response spreadsheet in the owner's Drive. See errors below.                                                                                                                                                            |
| `POST /forms/:id/destination`              | Body `{ spreadsheetId }` from Google Picker. Adds a responses tab to that spreadsheet and makes it the form's destination; only before the form has one. `422 invalid_spreadsheet_id`, `409 destination_exists`, `409 sheet_not_accessible` (not picked through this app), `409 google_access_required`. Returns the form view. |
| `GET /forms/:id/deliveries`                | `{ destination: { state } \| null, counts: { <deliveryState>: n } }`. Delivery records are pruned after 30 days.                                                                                                                                                                                                                |
| `POST /forms/:id/deliveries/resume`        | The owner says the sheet is fixed: sets the destination to `OK` and re-queues held deliveries, up to 100 per call. `{ resumed: n, more: boolean }`; call again while `more` is true. If the problem persists, the next delivery blocks again. `409 no_destination` before the first publish.                                    |
| `POST /forms/import`                       | Body: a form definition (as `Download JSON` exports it, up to 256 KB). Creates a new draft with a fresh form ID; field and option IDs are kept, so conditions keep working. `201` with the form view; `400 invalid_json`, `413 too_large`, `422 invalid_form` with `issues`.                                                    |
| `POST /forms/:id/duplicate`                | Copies the current draft into a new draft form titled "<title> (copy)": same fields and settings, a fresh ID, no spreadsheet and no responses. `201` with the new form view.                                                                                                                                                    |
| `PUT /forms/:id/slug`                      | Owner only (ADR 0025). Body `{ slug }`: the form's path on the owner's custom domain, lowercase letters, digits and inner hyphens, up to 64; `null` or `""` goes back to the form ID. `422 invalid_slug`, `409 slug_taken`. Returns the form view (`public.customUrl` is set while the domain is active).                       |
| `GET /forms/:id/members`                   | Owner only (ADR 0024): `{ members: [{ email, role }] }` with role `viewer` or `editor`.                                                                                                                                                                                                                                         |
| `PUT /forms/:id/members`                   | Owner only. Body `{ email, role }`; adds or changes a member (email lowercased). `422 invalid_email                                                                                                                                                                                                                             | invalid_role | is_owner`. |
| `DELETE /forms/:id/members/:email`         | Owner only. Removes a member. `204`.                                                                                                                                                                                                                                                                                            |
| `GET /forms/:id/responses?page=`           | Owner and members. A page of 50 responses, newest first, read from the owner's sheet now and never stored: `{ columns: [{ key, label, editable }], rows: [{ submissionId, cells }], total, page, pages }`. `Cache-Control: no-store`.                                                                                           |
| `PATCH /forms/:id/responses/:submissionId` | Owner and editors. Body `{ key, value }`: writes one answer cell (`RAW`), found by `_submission_id`; system columns can't be edited.                                                                                                                                                                                            |
| `GET /forms/:id/notifications`             | Owner only (ADR 0026): `{ available, enabled, email }`. `available` is false when the deployment can't send email.                                                                                                                                                                                                              |
| `PUT /forms/:id/notifications`             | Owner only. Body `{ enabled }`. `503 notifications_unavailable` without email sending.                                                                                                                                                                                                                                          |
| `GET /forms/:id/webhook`                   | The form's webhook (ADR 0021) or `null`: `{ url, failing, lastStatus, lastAttemptAt, lastOkAt }`. Never the secret.                                                                                                                                                                                                             |
| `PUT /forms/:id/webhook`                   | Body `{ url }`: a public `https://` address. Creates the webhook (`201` with the signing `secret`, shown only now) or changes its URL (`200`). `422 invalid_webhook_url` with `reason`.                                                                                                                                         |
| `POST /forms/:id/webhook/rotate`           | A new signing secret: `{ secret }`. `409 no_webhook`.                                                                                                                                                                                                                                                                           |
| `POST /forms/:id/webhook/test`             | Posts a sample body with `"test": true` now: `{ status, ok }` (`status` 0 when the endpoint didn't answer in 10 s).                                                                                                                                                                                                             |
| `DELETE /forms/:id/webhook`                | Removes the webhook. `204`.                                                                                                                                                                                                                                                                                                     |
| `DELETE /forms/:id`                        | Archives the form (it stops accepting responses). `204`. The spreadsheet is never touched.                                                                                                                                                                                                                                      |

Publish errors: `422 no_fields`, `422 invalid_form`, `409 google_access_required` (sign in again with Drive access), `409 destination_missing` with `kind` (the sheet or tab is gone), `409 publish_conflict` (another publish of the same form won), `503 google_unavailable` with `kind` (retry later).

Destination states: `OK`, `ACCESS_REVOKED`, `SHEET_DELETED`, `TAB_MISSING`, `COLUMN_MISSING`, `QUOTA` ([ADR 0005](adr/0005-sheet-is-externally-mutable.md)). Delivery states: `accepted`, `queued`, `delivering`, `delivered`, `retrying`, `unknown`, `blocked`, `permanently_failed` ([ADR 0003](adr/0003-delivery-states-and-reconciliation.md)).

## Notification emails

`GET /notifications/off?form=&token=` (the link in every notification email) shows a confirmation button; `POST /notifications/off` with the same `form` and `token` turns that form's emails off. A wrong token is `404`.

## Public forms

Served at `https://freelyforms.link/<formId>` in production and at `/f/<formId>` in development. When a forms domain is configured, `/f/<formId>` on the app domain redirects to it.

| Method and path   | Purpose                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /f/:formId`  | The published form as accessible HTML (`noindex`, nonce CSP, embeddable).                                |
| `GET /embed.js`   | Embed script (`/f/embed.js` in development); sizes `<iframe data-freelyforms>` to the form's height.     |
| `POST /f/:formId` | A submission. Accepts `application/x-www-form-urlencoded`, `multipart/form-data` (no files yet) or JSON. |

Submissions:

- Field values are keyed by field ID; multi-choice fields repeat the key (forms) or use an array (JSON). Choice answers are option IDs.
- With Turnstile enabled, include `cf-turnstile-response`.
- Body limit 64 KB. Rate limits: 20 per minute per IP, 5 per minute per IP and form.
- A hidden honeypot field `_hp` must stay empty; when it is filled the response looks accepted but is dropped.
- HTML clients get a success page, the form again with errors (`422`) or a challenge notice (`403`), or a "too many submissions" page (`429`). `404`, `413` and `400` are JSON for every client.
- Clients that send `Accept: application/json` get `201 { ok: true, submissionId, redirect? }` (`redirect` is the owner's after-submit page, when set), `422 { error: "invalid", errors: [{ fieldId, code, params? }] }`, `403 challenge_failed`, `429 rate_limited` (with `Retry-After`), `413 too_large`, `400 invalid_body` or `404 not_found`.

### On an owner's custom domain

`GET https://<owner's domain>/<slug or formId>` answers with a page that embeds the published form from the forms domain (the query string is passed on, so prefilling works), `noindex`, `frame-ancestors 'none'` ([ADR 0025](adr/0025-custom-domains.md)). `/robots.txt` disallows everything; every other path is `404` and every other method `405`. Nothing else of the service, such as the app or the API, answers on custom domains.

A `201` means the response was accepted and queued, not that it is already in the sheet: delivery is asynchronous and usually takes seconds ([ARCHITECTURE.md](ARCHITECTURE.md)).

## Embedding

```html
<iframe
  data-freelyforms
  src="https://freelyforms.link/<formId>"
  title="Contact us"
  width="100%"
  height="600"
  style="border:0;width:100%"
  loading="lazy"
></iframe>
<script src="https://freelyforms.link/embed.js" async></script>
```

The form page posts its height to the parent window (`{ type: "freelyforms:height", height }`); the script accepts these messages only from its own origin and asks again when it loads late. Without the script the iframe keeps its fixed height.

## Web app

The builder is served at `/app/` by the same Worker (static assets from `apps/web/dist`), so it uses the session cookie and the Origin check without CORS. `/` is the website home ([ADR 0015](adr/0015-website-in-the-api-worker.md)).

## Website pages

`POST /f/:formId/uploads` (forms domain; ADR 0007) gives the form page an upload slot for one file: body `{ fieldId, name, size, type }`, only from the form's own origin (`403 forbidden_origin` otherwise), rate-limited per IP. `201 { uploadUrl, token }`: the browser PUTs the bytes to `uploadUrl` (a Google resumable session, a secret never logged) and answers the field with `<fileId>:<token>`. `422 unknown_field | file_too_large | file_type | file_name`, `503 uploads_unavailable` when the owner's Google access or Drive is unavailable.

Server-rendered website on the app domain only (`apps/api/src/site`): `/`, `/how-it-works/`, `/why-free/`, `/security/`, `/integrations/google-sheets/`, `/features/embed/`, `/templates/` and `/templates/<slug>/` (with `/templates/<slug>/preview`, the template rendered by the public renderer), `/privacy`, `/terms`, `/sitemap.xml`, `/robots.txt`. Pages send `noindex` unless `SITE_INDEXABLE=1`. `POST /forms` with `{ template: "<slug>" }` copies a website template into a new draft (`422 unknown_template`).

## Operations

`GET /health` → `{ ok, schemaVersion, db }`.
