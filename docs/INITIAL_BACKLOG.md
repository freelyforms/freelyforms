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

- [ ] Google sign-in.
- [ ] User/session model.
- [ ] Google connection model separate from app session.
- [ ] Encrypted token storage (envelope encryption ready in `packages/crypto`; `google_connections.refresh_token` accepts envelopes only).
- [ ] Disconnect/revoke flow.

## Builder

- [ ] Form list/dashboard.
- [ ] Create form.
- [ ] Add/edit/remove fields.
- [ ] Reorder fields.
- [ ] Preview.
- [ ] Draft/published version model.

## Google Sheets

- [ ] Create spreadsheet.
- [ ] Store destination identifiers.
- [ ] Create header row.
- [ ] Append responses with `RAW` value input ([ADR 0002](adr/0002-raw-writes-for-respondent-data.md)).
- [ ] Stable field-to-column mapping via developer metadata ([ADR 0004](adr/0004-column-identity-developer-metadata.md)).
- [ ] Handle renamed/deleted/new fields.

## Public form

- [ ] Public route by form ID on the forms domain ([ADR 0010](adr/0010-separate-domain-for-public-forms.md)).
- [ ] Render published schema.
- [ ] Client + server validation.
- [ ] Submit endpoint.
- [x] Metadata schema without answer storage (`packages/db/migrations`, tested on SQLite and on local D1).
- [x] API skeleton: Cloudflare Worker (`apps/api`, Hono) with D1 binding, health check, security headers.
- [x] Decide where blocked payloads are held for up to 7 days ([ADR 0011](adr/0011-hold-store-for-blocked-deliveries.md): Workers KV with expiration).
- [ ] Durable queue with 7-day encrypted retention ([ADR 0008](adr/0008-queue-retention-and-encryption.md)).
- [ ] Batched, idempotent delivery ([ADR 0001](adr/0001-batched-sheets-writes.md), [ADR 0003](adr/0003-delivery-states-and-reconciliation.md)).
- [ ] Success and error states.
- [ ] Embed mode.

## Abuse/security

- [ ] Request limits.
- [ ] Turnstile integration.
- [ ] Logging redaction.
- [ ] Security headers.
- [ ] CSP.

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
