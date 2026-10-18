# Contributing to Freely Forms

Thanks for your interest in improving Freely Forms.

## Before you start

- Read [`docs/PRODUCT.md`](docs/PRODUCT.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and the [architecture decision records](docs/adr/).
- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Changes that contradict an accepted ADR need a new ADR in the same pull request.

## Contributor License Agreement

External contributions require signing the [Contributor License Agreement](CLA.md). On your first pull request a bot asks you to sign by posting one comment: `I have read the CLA Document and I hereby sign the CLA`. Signatures are kept on the `cla-signatures` branch. You keep the copyright in your work. See [ADR 0009](docs/adr/0009-license-apache-2-and-cla.md) for why.

## Ground rules

- Never commit secrets, credentials, real user data, or identifiers that grant access by themselves. Resource IDs in `wrangler.jsonc`, the public Turnstile site key, the Picker browser API key (restricted to the Picker API and our origin) and the Google project number are fine: they are public by design or useless without account credentials.
- Do not log OAuth tokens or form answers, even in tests or debug output.
- Respondent data is always written to Google Sheets as typed cells that Sheets never parses as formulas ([ADR 0002](docs/adr/0002-raw-writes-for-respondent-data.md), [ADR 0013](docs/adr/0013-delivery-refinements.md)).
- New Google OAuth scopes require an ADR ([ADR 0006](docs/adr/0006-oauth-scopes-drive-file-picker.md)).
- A feature is complete only with validation, error states, accessibility, tests for critical logic and documentation.

## Development

Requirements: Node.js 24 (see `.nvmrc`) and pnpm (version pinned in `package.json`; `corepack enable` installs it).

```sh
pnpm install
pnpm check   # format, lint, typecheck, tests, private-file guard
pnpm test:watch

# API and builder on a local Worker with a local D1 database
cp apps/api/.dev.vars.example apps/api/.dev.vars   # then fill in your own Google OAuth client (see below)
pnpm --filter @freelyforms/api db:migrate:local
pnpm dev   # builds apps/web, then rebuilds it on change while the Worker runs
```

You need your own Google Cloud project with an OAuth client first: follow "Google Cloud setup" in [docs/GOOGLE_INTEGRATION.md](docs/GOOGLE_INTEGRATION.md) and add your Google account as a test user.

Attaching an existing sheet locally needs `PICKER_API_KEY` and `GOOGLE_PROJECT_NUMBER` in `.dev.vars` (a key from your project restricted to `http://localhost:8787/*`); without them that one feature reports it is unavailable.

The website is at http://localhost:8787/ (always `noindex` locally). Open the builder at http://localhost:8787/app/ in Chrome or Firefox (the `__Host-` session cookie needs a browser that treats `http://localhost` as secure). The builder is a static app served by the same Worker, so there is no separate dev server and no CORS; reload the page after a change. CI also runs `pnpm build`; the hourly maintenance job runs locally only with `wrangler dev --test-scheduled`.

To check delivery against real Google Sheets with your own account, sign in at http://localhost:8787/app/ with Drive access, then run `FREELYFORMS_LIVE_GOOGLE=1 pnpm exec vitest run apps/api/test/sheets.live.test.ts`. It creates a spreadsheet named "Freely Forms test responses" in your Drive; it is skipped in normal test runs and CI.

The API tests apply the real migrations to a local D1 database (workerd) through Wrangler; no Cloudflare account is needed.

End-to-end tests (`pnpm e2e`) build the builder and run Playwright against a test build of the Worker (`apps/api/e2e/worker.ts`) on a fresh local database: Google's token and Sheets endpoints are answered by an in-memory fake, Turnstile uses its always-passing test keys (the widget still loads from Cloudflare, so the tests need a network connection), and a test-only route signs you in. They cover publishing a template, browser-side validation, prefilled links, UTM capture, delivery to the sheet, an embedded form on another origin with a redirect, and a phone-sized dark-mode check. Install a browser once with `pnpm --filter @freelyforms/api exec playwright install chromium`, or set `E2E_CHANNEL=chrome` to use an installed Chrome. CI runs them on every push.

The workspace installs only package versions published at least 14 days ago (`minimumReleaseAge` in `pnpm-workspace.yaml`).

## Repository hooks

Run `./scripts/install-git-hooks.sh` once after cloning. The pre-commit hook blocks files that must never be committed.

## Licence

By contributing you agree that your contributions are licensed under the [Apache License 2.0](LICENSE) and the terms of the [CLA](CLA.md).

## Deploying (maintainers)

The hosted service is the `production` environment in `apps/api/wrangler.jsonc` (Worker `freelyforms`, custom domains `freelyforms.com`, `www.freelyforms.com` (redirects to the apex) and `freelyforms.link`, Workers Free per [ADR 0014](docs/adr/0014-run-on-workers-free.md)).

```sh
cd apps/api
pnpm exec wrangler login                                            # once
pnpm exec wrangler d1 migrations apply DB --remote --env production  # when packages/db/migrations changed
pnpm --filter @freelyforms/web build && pnpm exec wrangler deploy --env production
```

Secrets live only in Cloudflare (`wrangler secret put <NAME> --env production`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MASTER_KEY_K1`, `TURNSTILE_SECRET_KEY`. Never paste them into commands, issues or chat; pipe them in.
