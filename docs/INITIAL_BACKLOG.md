# Initial Engineering Backlog

Tracks the Phase 1 MVP ([ROADMAP.md](ROADMAP.md)). Last reviewed 2026-10-16.

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
- [x] Disconnect/revoke flow (revoke at Google, delete the stored token; new responses wait as blocked deliveries).
- [x] Account deletion (metadata, credentials and held deliveries; never the owner's Sheets or Drive files).
- [x] Scheduled cleanup of expired sessions and pruned delivery records (hourly cron).

## Builder

- [x] Forms API: list, create, save draft, publish, soft delete ([API.md](API.md)).
- [x] Draft/published version model.
- [x] Web app `apps/web`: sign-in, form list/dashboard.
- [x] Add/edit/remove/duplicate fields, field settings, options.
- [x] Reorder fields (buttons and drag and drop).
- [x] Preview with the real renderer.
- [x] Publish flow with the public link, the sheet link and the embed code.
- [x] Delivery status panel: destination state, counts by delivery state, "Resume" after a fix.
- [ ] Browser tests of the builder (Playwright) once the UI settles.
- [x] Export the form definition as JSON (CLAUDE.md: forms must be exportable).
- [x] Saves never overlap; edits are saved when leaving the editor; an ended session is shown with a way to sign in again.
- [ ] Import a form from JSON.

## Google Sheets

- [x] Create spreadsheet (`packages/google`).
- [x] Attach an existing spreadsheet through Google Picker (ADR 0006): a new responses tab, before the first publish; browser API key restricted to the Picker API and the site.
- [ ] Switch a published form to another spreadsheet (held deliveries and history need a design).
- [x] Store destination identifiers.
- [x] Create header row (frozen, bold, system columns first).
- [x] Append responses as typed, never-parsed cells ([ADR 0002](adr/0002-raw-writes-for-respondent-data.md)).
- [x] Stable field-to-column mapping via developer metadata ([ADR 0004](adr/0004-column-identity-developer-metadata.md)).
- [x] New and deleted fields (new fields get new columns after all existing ones; deleted fields keep their column; columns the owner deletes are recreated, [ADR 0013](adr/0013-delivery-refinements.md)).
- [x] Renamed fields: the header text is updated on publish.
- [ ] Column cache to save read quota ([ADR 0013](adr/0013-delivery-refinements.md)).
- [ ] Per-owner concurrency cap on writes ([ADR 0001](adr/0001-batched-sheets-writes.md)).

## Public form

- [x] Public route by form ID on the forms domain ([ADR 0010](adr/0010-separate-domain-for-public-forms.md)).
- [x] Render published schema.
- [x] Server validation with accessible error messages on the server-rendered form.
- [x] Submit endpoint.
- [x] Metadata schema without answer storage (`packages/db/migrations`, tested on SQLite and on local D1).
- [x] API skeleton: Cloudflare Worker (`apps/api`, Hono) with D1 binding, health check, security headers.
- [x] Decide where blocked payloads are held for up to 7 days ([ADR 0011](adr/0011-hold-store-for-blocked-deliveries.md): Workers KV with expiration).
- [x] Durable delivery with a 7-day encrypted deadline ([ADR 0008](adr/0008-queue-retention-and-encryption.md); on Workers Free the queue keeps 24 h and longer waits move to KV, [ADR 0014](adr/0014-run-on-workers-free.md)).
- [x] Batched, idempotent delivery ([ADR 0001](adr/0001-batched-sheets-writes.md), [ADR 0003](adr/0003-delivery-states-and-reconciliation.md)).
- [x] Success and error states.
- [ ] Client-side validation enhancement (same `form-engine` in the browser).
- [x] Basic appearance: theme settings in the schema (accent colour, light/dark), applied by the renderer.
- [ ] Appearance, later: font, logo, background.
- [x] Embed: iframe snippet and a small script that resizes the iframe ([API.md](API.md#embedding)).
- [x] "Report abuse" link on every form page ([ADR 0010](adr/0010-separate-domain-for-public-forms.md)).
- [x] Dashboard notice: the forms list flags forms whose delivery needs the owner's action.
- [ ] Email notification of blocked and soon-to-expire deliveries.

## Abuse/security

- [x] Request limits (Workers Rate Limiting: 20/min per IP, 5/min per IP and form).
- [x] Turnstile integration (server-side verification; test keys in development).
- [x] Logging policy: only error names and codes are logged, never tokens or answers.
- [ ] Error reporting with scrubbing (when a reporting service is chosen).
- [x] Security headers.
- [x] CSP (nonce-based on form pages; `frame-ancestors 'none'` on app pages, `*` on forms for embedding).

## Public site surfaces

See `docs/SEO_PUBLIC_SURFACES.md`.

- [x] Website v1 (server-rendered in the Worker, `noindex` until review): home, how it works, why free, security, Google Sheets, embed, templates hub and five templates with live previews and "Use this template".
- [ ] Content model for template/feature/integration pages beyond the first five (template schema JSON + page content).
- [x] Template preview rendered by the real form renderer.
- [x] Sitemap, canonical URLs, robots.txt, Open Graph (one sitemap for now; partition when families grow).
- [x] `noindex` for public user forms, app, editor and preview routes.
- [x] Decide public form host domain: `freelyforms.link` ([ADR 0010](adr/0010-separate-domain-for-public-forms.md)).
- [ ] Facts/feature-status data source with expiry check in CI, so public pages never show stale or unshipped claims.
- [ ] Content lint for template pages (duplicate field sets, duplicate titles, required blocks).

## Launch readiness

- [x] Run within Workers Free limits for the beta ([ADR 0014](adr/0014-run-on-workers-free.md)).
- [x] Production environment on Workers Free: D1, KV, queue + DLQ, rate limits, secrets, custom domains `freelyforms.com` and `freelyforms.link`, real Turnstile widget (2026-10-16). Workers Paid before the public launch.
- [x] Production Google Cloud project `freelyforms-prod`: Sheets and Drive APIs, auth platform "Freely Forms" (External), the four non-sensitive scopes, homepage/privacy/terms links, authorised domain, OAuth client "production" (2026-10-16).
- [x] OAuth app published "In production" (in Testing, `drive.file` refresh tokens expire after 7 days and only test users can sign in).
- [ ] Remove the production origin from the development project's OAuth client.
- [x] Picker API enabled in the production project with a restricted browser key.
- [ ] Brand verification: domain ownership in Search Console, app name, logo (120×120), support email, homepage and privacy policy links.
- [x] Homepage at `/` that describes the app and links the privacy policy and terms (server-rendered, `noindex` until the website launches).
- [x] "Sign in with Google" button following Google's branding guidelines.
- [ ] App logo and favicon.
- [ ] Measure consumer CPU time against the 10 ms Workers Free limit.
- [x] Privacy policy (`/privacy`, includes the 7-day transient retention and Google's Limited Use statement) and terms (`/terms`), operator: the non-commercial Freely Forms project. Legal review before public launch.
- [ ] Status/health checks; periodic destination health checks ([ADR 0005](adr/0005-sheet-is-externally-mutable.md)).
- [ ] Minimal public docs.
