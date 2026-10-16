# Contributing to Freely Forms

Thanks for your interest in improving Freely Forms.

## Before you start

- Read [`docs/PRODUCT.md`](docs/PRODUCT.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and the [architecture decision records](docs/adr/).
- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Changes that contradict an accepted ADR need a new ADR in the same pull request.

## Contributor License Agreement

External contributions require signing the [Contributor License Agreement](CLA.md). A bot will ask you to sign on your first pull request; it takes one click. You keep the copyright in your work. See [ADR 0009](docs/adr/0009-license-apache-2-and-cla.md) for why.

## Ground rules

- Never commit secrets, credentials, real user data or production identifiers.
- Do not log OAuth tokens or form answers, even in tests or debug output.
- Respondent data is always written to Google Sheets with `RAW` value input ([ADR 0002](docs/adr/0002-raw-writes-for-respondent-data.md)).
- New Google OAuth scopes require an ADR ([ADR 0006](docs/adr/0006-oauth-scopes-drive-file-picker.md)).
- A feature is complete only with validation, error states, accessibility, tests for critical logic and documentation.

## Development

Requirements: Node.js 24 (see `.nvmrc`) and pnpm (version pinned in `package.json`; `corepack enable` installs it).

```sh
pnpm install
pnpm check   # format, lint, typecheck, tests, private-file guard
pnpm test:watch

# API and builder on a local Worker with a local D1 database
cp apps/api/.dev.vars.example apps/api/.dev.vars   # then fill in your own Google OAuth client
pnpm --filter @freelyforms/api db:migrate:local
pnpm dev   # builds apps/web, then rebuilds it on change while the Worker runs
```

Open http://localhost:8787/app/. The builder is a static app served by the same Worker, so there is no separate dev server and no CORS; reload the page after a change.

To check delivery against real Google Sheets with your own account, sign in at http://localhost:8787/app/ with Drive access, then run `FREELYFORMS_LIVE_GOOGLE=1 pnpm exec vitest run apps/api/test/sheets.live.test.ts`. It creates a spreadsheet named "Freely Forms test responses" in your Drive; it is skipped in normal test runs and CI.

The API tests apply the real migrations to a local D1 database (workerd) through Wrangler; no Cloudflare account is needed.

The workspace installs only package versions published at least 14 days ago (`minimumReleaseAge` in `pnpm-workspace.yaml`).

## Repository hooks

Run `./scripts/install-git-hooks.sh` once after cloning. The pre-commit hook blocks files that must never be committed.

## Licence

By contributing you agree that your contributions are licensed under the [Apache License 2.0](LICENSE) and the terms of the [CLA](CLA.md).
