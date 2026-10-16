# 0010. Public forms are served from a separate domain

Date: 2026-10-16

## Status
Accepted

## Context
Anyone can publish a form, so some forms will be abusive (credential phishing, spam). Safe Browsing, URL blocklists and mail filters usually act on the registrable domain, so one abusive form on the main domain could block the website, sign-in and transactional email for everyone. Forms also render owner-supplied styling, which should be isolated from the application's session cookies.

## Decision
- `freelyforms.com`: website, sign-in, builder, dashboard, API and transactional email.
- `freelyforms.link`: published public forms and the embed script only.
- The forms domain sets no application session cookies, sends `X-Robots-Tag: noindex`, and uses a strict Content Security Policy.
- Form URLs use a stable, non-guessable short ID: `https://freelyforms.link/<formId>`. Readable aliases and owner custom domains may be added later as additional routes to the same form identity.
- Abuse reports and takedowns operate on the forms domain without affecting the main domain.

## Consequences
- Published links are permanent, so the URL shape above must not change after the first public form.
- Respondents see a domain that differs from the website; the form page shows clear branding and a "Report abuse" link.
