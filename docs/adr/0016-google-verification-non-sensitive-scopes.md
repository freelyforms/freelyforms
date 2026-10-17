# 0016. Google verification for the production app

Date: 2026-10-17

## Status

Accepted. Refines [ADR 0006](0006-oauth-scopes-drive-file-picker.md).

## Context

ADR 0006 expected the consent screen verification to need a demo video. All requested scopes (`openid`, `email`, `profile`, `drive.file`) are non-sensitive, and an app in Testing mode gets refresh tokens for `drive.file` that expire after 7 days, which would block every owner's delivery weekly.

## Decision

- The hosted service uses its own Google Cloud project, `freelyforms-prod`, published **In production**. Development projects may stay in Testing.
- With only non-sensitive scopes there is no security assessment and no demo video; **brand verification** (app name, logo, verified homepage domain, privacy policy and terms links, support email) is what shows the app's name and logo on the consent screen.
- The Picker uses a browser API key restricted to the Picker API and the site's origin, and the project number as its app ID; both are public by design.

## Consequences

- Until brand verification completes, Google's consent screen shows the domain instead of the app name.
- Adding a sensitive or restricted scope later would require the full verification process and a new ADR.
