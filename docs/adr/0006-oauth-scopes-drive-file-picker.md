# 0006. OAuth scopes: `drive.file` and Google Picker only

Date: 2026-10-16

## Status

Accepted

## Context

The `spreadsheets` scope is sensitive and grants access to every spreadsheet the owner has; `drive` is restricted and requires an annual third-party security assessment. Both contradict the principle of least privilege. Public apps still need OAuth consent-screen and brand verification regardless of scope; `drive.file` avoids only the sensitive/restricted reviews.

## Decision

- Requested scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.file`.
- New response spreadsheets and upload folders are created by the app, so `drive.file` covers them.
- Existing spreadsheets are attached only through Google Picker, which grants `drive.file` access to the files the owner selects.
- Never request `spreadsheets`, `drive`, `drive.readonly` or other broad scopes. Adding any scope requires a new ADR.
- Additional scopes for future features (for example Gmail sending) are requested incrementally, only when the owner enables that feature.

## Consequences

- The app cannot list or open the owner's other files, which is the privacy promise in plain terms.
- Picker needs a browser API key and the Cloud project number; neither is a secret but both are restricted by HTTP referrer.
- Consent-screen verification (privacy policy, domain verification, demo video) is still required before public launch.
