# Product Roadmap

This is a capability roadmap, not a deadline commitment.

## Phase 0 — Foundation

Status: done (deployed to Cloudflare on 2026-10-16). The builder's CSS tokens are the start of the design system.

- repository and monorepo setup;
- CI;
- schema package;
- auth model;
- secure secret handling;
- local development setup;
- deployment skeleton;
- basic design system.

## Phase 1 — End-to-end MVP

Status: in progress. Done in the API: sign-in, form CRUD, publishing, Sheet creation, public form, anonymous submission, queued delivery, abuse controls. Done in the web app: builder with live preview, basic theme, publish flow, embed code, delivery status. Done for owners: account disconnect/deletion, privacy policy and terms, production deployment (early preview). Attaching an existing sheet through Google Picker is done. For a public launch: Google brand verification (logo), Workers Paid, legal review of the privacy policy and terms, owner email notifications, website content review before indexing, publishing the repository with secret scanning and the CLA bot. See [INITIAL_BACKLOG.md](INITIAL_BACKLOG.md).

- Google sign-in;
- create/edit/delete form;
- core field types;
- basic drag/reorder builder;
- create a Google Sheet destination or attach an existing one (Google Picker);
- public form URL;
- anonymous submission;
- append to Google Sheet;
- success message;
- basic theme;
- iframe embed;
- anti-abuse controls;
- basic delivery status/error handling.

Release publicly as soon as this is trustworthy.

## Phase 2 — Better than basic Google Forms

- sections and multi-page forms;
- progress indicator;
- conditional visibility;
- conditional required state;
- hidden fields (done);
- UTM capture (done, including from the page an embedded form sits on);
- URL prefilling (done);
- richer layout/themes;
- custom validation;
- redirects after submitting (done);
- duplication/templates;
- conversational rendering mode.

## Phase 3 — Advanced building blocks

- file upload -> Google Drive;
- signature;
- calculations;
- rating/ranking/matrix fields;
- advanced logic/jumps;
- webhook destinations;
- custom domains;
- payment provider connection;
- basic collaboration/sharing.

## Phase 4 — Documents and workflows

- Google Docs templates;
- PDF generation;
- approval steps;
- workflow actions;
- Gmail/SMTP notifications;
- scheduled actions;
- reusable workflow templates.

## Phase 5 — Ecosystem

- Google Workspace Marketplace;
- import from Google Forms;
- import from major competitors where technically/legalistically appropriate;
- template marketplace/community templates;
- public API;
- MCP server;
- BYOK AI form/workflow generation;
- self-hosting deployment guides.
