# 0015. The public website is server-rendered in the API Worker

Date: 2026-10-17

## Status

Accepted. Refines [ADR 0012](0012-single-worker-for-mvp.md).

## Context

The project layout planned the public website inside `apps/web`, next to the builder. The first website pages need the real form renderer for template previews, the form schema for template data, and only a handful of pages; a separate static-site build and deploy would add tooling before there is content to justify it.

## Decision

- Website pages are server-rendered by the API Worker (`apps/api/src/site`) on the app domain: home, explainer pages, templates and legal pages.
- They use their own nonce-based CSP (no scripts), their own layout and `public, max-age=300` caching, and send `noindex` until `SITE_INDEXABLE=1` is set.
- Template previews render template schemas with the public form renderer, framed only by the site itself.
- The website is never served on the forms domain.

## Consequences

- One deploy updates the app, the API and the website; website copy changes go through the same review and tests.
- The website shares the app's origin, so it must never render per-user content in cached pages.
- When the website grows (many templates, guides, a blog), moving it to a static build is a packaging change: pages are plain functions of data.
