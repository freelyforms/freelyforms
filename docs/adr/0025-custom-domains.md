# 0025. Custom domains

Date: 2026-10-18

## Status

Accepted.

## Context

Owners want forms at their own address (`forms.acme.com/contact`) instead of `freelyforms.link/frm_…`. Certificates and hostname validation for many domains are a solved problem in Cloudflare for SaaS, which the forms zone can use at no cost for the first 100 hostnames. Turnstile, however, accepts at most 10 hostnames per widget on the free plan, and the public form page, its submission endpoint and Drive upload sessions are all tied to the forms origin (ADR 0007, ADR 0010).

## Decision

- **One domain per owner.** `custom_domains(owner_id, hostname, cf_id, status, detail, checked_at, created_at)`; all of the owner's published forms open on it. A form is reachable by its ID and, optionally, by a `slug` unique per owner (`forms.slug`, lowercase letters, digits and inner hyphens).
- **Cloudflare for SaaS.** The Worker registers the hostname as a custom hostname of the forms zone with HTTP validation (`CF_ZONE_ID`, secret `CF_CUSTOM_HOSTNAMES_TOKEN` limited to SSL and Certificates on that zone). The owner adds one CNAME to `CUSTOM_DOMAIN_TARGET`, the zone's fallback origin. A `*/*` route on the forms zone sends custom hostname traffic to the Worker.
- **A shell page that embeds the form.** On a custom domain, `/<slug or ID>` returns a minimal page with the standard embed (iframe plus `embed.js`) pointing at the forms domain, passing on the query string. The challenge, the submission, uploads and redirects run exactly as for any embed; the address bar shows the owner's domain. Everything else on a custom domain is 404, including the app, the API and other names under the forms domain.
- **State.** Owners see `pending`, `active` or `failed`; a pending domain is rechecked when the owner looks (at most every 15 s) and hourly by the cron. A domain not active within 7 days is released, so a name can't be held by someone who doesn't control its DNS.
- **Cost guard.** The hourly health line counts custom domains and logs `ops_alert` when one is added while 80 or more exist.

## Consequences

- Owners get branded links without any change to form identity, submission handling or the privacy model; no submission data passes through anything new.
- Forms on custom domains are framed, so they depend on the respondent's browser allowing a third-party iframe (as embeds already do) and inherit the embed's auto-height.
- Above 100 domains Cloudflare charges per hostname; that decision is taken when the alert fires. More domains per owner, apex domains without CNAME flattening, and per-domain branding can follow.
