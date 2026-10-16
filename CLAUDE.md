# CLAUDE.md — Project Operating Context

## Mission

Build a globally useful, open-source, free-forever form and workflow platform whose core differentiator is **user-owned infrastructure**:

- form responses are written to the form owner's Google Sheets;
- uploaded files are stored in the form owner's Google Drive;
- the service does not need to own the user's submission database;
- hosted usage should remain free for normal users, with no artificial form/submission limits;
- the product must be credible as a serious open-source platform, not a hobby demo.

Product name: **Freely Forms** (primary domain `freelyforms.com`). Keep the brand out of core architecture identifiers; use it in UI, docs, marketing site and the package scope only.

## Primary product thesis

> We build the interface. Google stores the data.

Secondary thesis:

> Your forms. Your cloud. Your data.

The product should eventually become the **open-source form and workflow layer for Google Workspace**.

## Read order

Before making architectural or product decisions, read:

1. `docs/PRODUCT.md`
2. `docs/ARCHITECTURE.md`
3. `docs/FORM_SCHEMA.md`
4. `docs/GOOGLE_INTEGRATION.md`
5. `docs/SECURITY_PRIVACY.md`
6. `docs/ROADMAP.md`
7. `docs/ENGINEERING_PRINCIPLES.md`
8. `docs/SEO_PUBLIC_SURFACES.md`
9. `docs/adr/README.md` — accepted architecture decisions; do not contradict an ADR without writing a new one.

If the local `private/` directory exists, also read all Markdown files in it. Those files contain internal strategy and must never be committed or copied into public documentation.

## Hard constraints

- Core product must be usable without payment.
- Do not build artificial pricing limits around forms, fields, responses, or normal file usage.
- Prefer infrastructure paid/provided by the user where appropriate: Google Drive, Google Sheets, Gmail/SMTP, Stripe, AI BYOK.
- Do not persist form submission content in the central application database unless a future feature explicitly requires it and privacy implications are reviewed.
- Store only the minimum operational metadata needed for routing, form definition/versioning, OAuth connection state, and aggregate analytics.
- Google OAuth tokens must be encrypted at rest. Never log tokens.
- Request the narrowest Google OAuth scopes possible.
- Public forms must not require the respondent to have a Google account unless the form owner explicitly enables authentication.
- Form rendering and validation must be schema-driven.
- Builder, public renderer, conversational renderer, import/export, AI generation and future mobile clients must share the same versioned form schema.
- Avoid proprietary lock-in. Forms must be exportable as JSON.
- Keep hosted product and self-hosted product conceptually aligned.
- Public repository must not contain anything from `private/` or any internal strategy (marketing, SEO prioritisation, business plans).

## Suggested implementation shape

Use a TypeScript monorepo. Prefer current stable versions at implementation time.

Target layout (packages are added only when code needs them; `form-schema`, `form-engine` and `crypto` exist today):

```text
apps/
  web/              # builder, dashboard and public website
  api/              # edge API: auth, form CRUD, publish, submit endpoint
  worker-delivery/  # queue consumer: batching, Sheets writes, reconciliation
packages/
  form-schema/      # versioned schema types, JSON Schema export, migrations
  form-engine/      # validation (and later logic), shared by browser and server
  renderer/         # lightweight public renderer + embed script
  google/           # OAuth, Sheets/Drive clients, developer metadata, RAW writes
  db/               # metadata repository layer (no answers)
  crypto/           # envelope encryption for tokens and queue payloads
```

Do not split out `ui`, `auth`, `analytics` or `validation` packages until a second consumer exists.

Tooling: Node 24 (`.nvmrc`), pnpm workspace, strict TypeScript 6, ESLint, Prettier, Vitest. Run `pnpm check` before committing.

Infrastructure target:

- Cloudflare-compatible edge deployment where practical;
- queue between public submission and Google write path;
- relational metadata store (D1/Postgres-compatible abstraction is acceptable);
- Turnstile or equivalent privacy-conscious abuse protection;
- object storage only for temporary processing, never as default permanent submission storage.

Do not prematurely add microservices.

## Definition of done for each feature

A feature is not complete until it has:

1. schema/data model;
2. validation;
3. accessibility consideration;
4. responsive UI;
5. error states;
6. audit/security review where relevant;
7. tests for critical logic;
8. documentation;
9. no leakage of private strategy into public files.

## Decision-making rule

Prefer the design that improves, in this order:

1. user data ownership;
2. product reliability;
3. simplicity;
4. portability/open-source credibility;
5. low central infrastructure cost;
6. growth/distribution potential.

Do not optimise for monetisation unless explicitly asked.

## Current first milestone

Build an MVP that lets a user:

1. Sign in with Google.
2. Create a form.
3. Add common fields.
4. Create or attach a Google Sheet.
5. Publish a public form URL.
6. Submit the form anonymously.
7. See the response appended to their Google Sheet.
8. Embed the form on another website.
9. Change basic appearance.
10. Protect submissions from obvious abuse.

No payment system is required for MVP.
