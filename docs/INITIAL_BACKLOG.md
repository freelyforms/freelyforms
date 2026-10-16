# Initial Engineering Backlog

## Repository

- [x] Initialise pnpm monorepo.
- [x] Add TypeScript strict mode.
- [x] Add linting/formatting.
- [x] Add unit test framework.
- [x] Add CI for format/lint/typecheck/test (`.github/workflows/ci.yml`).
- [ ] Enable GitHub secret scanning and push protection when the repository is published.

## Schema

- [x] Create `packages/form-schema`.
- [x] Define schema versioning.
- [x] Define MVP field types.
- [x] Define validation model (`validateSubmission` in `packages/form-engine`).
- [ ] Define conditional-logic model placeholder.
- [x] Add JSON schema/export representation.

## Auth

- [x] Google sign-in (OIDC authorization code flow with PKCE, state and nonce; `apps/api/src/auth`).
- [x] User/session model (server-side sessions, only a token hash stored, `__Host-` cookie).
- [x] Google connection model separate from app session.
- [x] Encrypted token storage (refresh token as an envelope bound to the user ID).
- [ ] Disconnect/revoke flow.
- [x] Scheduled cleanup of expired sessions and pruned delivery records (hourly cron).

## Builder

- [ ] Form list/dashboard.
- [x] Create form.
- [ ] Add/edit/remove fields.
- [ ] Reorder fields.
- [ ] Preview.
- [x] Draft/published version model.

## Google Sheets

- [x] Create spreadsheet (`packages/google`).
- [x] Store destination identifiers.
- [x] Create header row (frozen, bold, system columns first).
- [x] Append responses as typed, never-parsed cells ([ADR 0002](adr/0002-raw-writes-for-respondent-data.md)).
- [x] Stable field-to-column mapping via developer metadata ([ADR 0004](adr/0004-column-identity-developer-metadata.md)).
- [x] Handle renamed/deleted/new fields (new fields get new columns on publish; deleted fields keep their column).

## Public form

- [x] Public route by form ID on the forms domain ([ADR 0010](adr/0010-separate-domain-for-public-forms.md)).
- [x] Render published schema.
- [x] Client + server validation (server-rendered form; client-side enhancement still to do).
- [x] Submit endpoint.
- [x] Metadata schema without answer storage (`packages/db/migrations`, tested on SQLite and on local D1).
- [x] API skeleton: Cloudflare Worker (`apps/api`, Hono) with D1 binding, health check, security headers.
- [x] Decide where blocked payloads are held for up to 7 days ([ADR 0011](adr/0011-hold-store-for-blocked-deliveries.md): Workers KV with expiration).
- [x] Durable queue with 7-day encrypted retention ([ADR 0008](adr/0008-queue-retention-and-encryption.md)).
- [x] Batched, idempotent delivery ([ADR 0001](adr/0001-batched-sheets-writes.md), [ADR 0003](adr/0003-delivery-states-and-reconciliation.md)).
- [x] Success and error states.
- [ ] Embed mode.

## Abuse/security

- [x] Request limits (Workers Rate Limiting: 20/min per IP, 5/min per IP and form).
- [x] Turnstile integration (server-side verification; test keys in development).
- [ ] Logging redaction.
- [x] Security headers.
- [x] CSP (nonce-based on form pages; `frame-ancestors 'none'` on app pages, `*` on forms for embedding).

## Public site surfaces

See `docs/SEO_PUBLIC_SURFACES.md`.

- [ ] Content model for template/feature/integration pages (template schema JSON + page content).
- [ ] Template preview rendered by the real form renderer.
- [ ] Sitemaps partitioned by page family; canonical URLs; robots.txt.
- [ ] `noindex` for public user forms, app, editor and preview routes.
- [x] Decide public form host domain: `freelyforms.link` ([ADR 0010](adr/0010-separate-domain-for-public-forms.md)).
- [ ] Facts/feature-status data source with expiry check in CI, so public pages never show stale or unshipped claims.
- [ ] Content lint for template pages (duplicate field sets, duplicate titles, required blocks).

## Launch readiness

- [ ] Privacy policy draft.
- [ ] Terms draft.
- [ ] OAuth verification checklist.
- [ ] Status/health checks.
- [ ] Minimal public docs.
