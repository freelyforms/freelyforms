# Initial Engineering Backlog

## Repository
- [ ] Initialise pnpm monorepo.
- [ ] Add TypeScript strict mode.
- [ ] Add linting/formatting.
- [ ] Add unit test framework.
- [ ] Add CI for lint/test/build.
- [ ] Configure secret scanning.

## Schema
- [ ] Create `packages/form-schema`.
- [ ] Define schema versioning.
- [ ] Define MVP field types.
- [ ] Define validation model.
- [ ] Define conditional-logic model placeholder.
- [ ] Add JSON schema/export representation.

## Auth
- [ ] Google sign-in.
- [ ] User/session model.
- [ ] Google connection model separate from app session.
- [ ] Encrypted token storage.
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
- [ ] Append one response.
- [ ] Stable field-to-column mapping.
- [ ] Handle renamed/deleted/new fields.

## Public form
- [ ] Public route by slug.
- [ ] Render published schema.
- [ ] Client + server validation.
- [ ] Submit endpoint.
- [ ] Durable queue.
- [ ] Idempotent delivery.
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
- [ ] Decide public form host domain (separate from the marketing site) for abuse isolation.
- [ ] Facts/feature-status data source with expiry check in CI, so public pages never show stale or unshipped claims.
- [ ] Content lint for template pages (duplicate field sets, duplicate titles, required blocks).

## Launch readiness
- [ ] Privacy policy draft.
- [ ] Terms draft.
- [ ] OAuth verification checklist.
- [ ] Status/health checks.
- [ ] Minimal public docs.
