# Freely Forms

Open-source, free-forever forms whose responses go to your own Google Sheets. Website: [freelyforms.com](https://freelyforms.com) (early preview).

An open-source form platform designed around one simple principle:

> **The product provides the experience; the user owns the data.**

Responses go directly to the form owner's Google Sheets. Uploaded files should go to the owner's Google Drive. The hosted core is intended to remain free for normal usage without artificial form or response quotas.

## Status

Pre-alpha. Deployed at [freelyforms.com](https://freelyforms.com) for testing; sign-in is limited to test users until Google verifies the app. Working today, end to end against real Google accounts: Google sign-in, a forms API, publishing with automatic creation of the response spreadsheet, anonymous public forms with spam protection, and queued, idempotent delivery of responses to the owner's sheet. A web builder with live preview, basic theming and embedding. Owners can disconnect Google or delete their account; the privacy policy and terms are published. In progress: attaching an existing sheet and Google's verification of the app. See [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/INITIAL_BACKLOG.md](docs/INITIAL_BACKLOG.md).

## What this is trying to become

A modern alternative to traditional hosted form builders, with:

- visual form builder;
- classic and conversational rendering;
- Google Sheets as user-owned response storage;
- Google Drive for uploads;
- conditional logic;
- multi-page forms;
- calculations;
- signatures;
- webhooks;
- payments through the owner's provider account;
- document/PDF generation;
- approvals and workflows;
- AI through bring-your-own-key integrations;
- self-hosting and open-source portability.

## What this repository should not become

- a clone of Google Sheets;
- a CRM;
- an email marketing platform;
- an analytics warehouse containing user submissions;
- a proprietary data silo;
- a paywall around basic form usage.

## Documentation

Start with [docs/PRODUCT.md](docs/PRODUCT.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), then the [HTTP API](docs/API.md) and the architecture decision records in [`docs/adr/`](docs/adr/). [CONTRIBUTING.md](CONTRIBUTING.md) explains local development.

Internal strategy may exist locally under `private/`. That directory is intentionally ignored by Git and must never be published.

## Contributing, security and licence

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute; external contributions require the [CLA](CLA.md).
- [SECURITY.md](SECURITY.md) — report vulnerabilities privately to hello@freelyforms.com.
- Licensed under the [Apache License 2.0](LICENSE).
