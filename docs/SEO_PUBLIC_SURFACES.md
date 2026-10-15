# Public SEO Surfaces

This document defines implementation surfaces only. Keyword prioritisation, competitor targets and acquisition strategy belong in the ignored `private/` directory.

## Indexable page families

Potential public surfaces:

- homepage;
- feature pages;
- integration pages;
- use-case pages;
- form template pages;
- industry pages;
- comparison/alternative pages where claims are factual and useful;
- documentation;
- developer/API documentation;
- open-source/self-hosting pages;
- changelog;
- engineering blog;
- template marketplace pages.

## Template route concept

Examples of route patterns:

```text
/templates/contact-form/
/templates/customer-feedback/
/templates/event-registration/
/templates/job-application/
/templates/client-intake/
```

Each page should contain a genuinely usable template, preview, field explanation and one-click use flow. Avoid mass-generating thin pages.

## Technical requirements

- SSR/SSG where appropriate;
- clean canonical URLs;
- metadata generated from structured content models;
- Open Graph/Twitter metadata;
- schema.org markup only where valid;
- fast Core Web Vitals;
- accessible HTML;
- index controls for user-generated/public forms;
- sitemap partitioning by page family;
- hreflang only after real localisation exists;
- avoid indexing duplicate preview/editor routes.

## Public form indexing
Default public user forms to noindex unless the owner explicitly chooses to make a form discoverable and the product has anti-spam/content-quality controls.
