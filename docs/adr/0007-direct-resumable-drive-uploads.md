# 0007. File uploads go directly to the owner's Drive

Date: 2026-10-16 (accepted 2026-10-18 after a spike)

## Status

Accepted.

## Context

Proxying uploaded files through edge workers hits request-size and CPU limits and turns the platform into a file proxy that temporarily holds respondents' files.

## Spike (2026-10-18, production, the owner's own Drive)

- A resumable session created by the server with the owner's `drive.file` access token and an `Origin` header returns `200` and a session URI.
- A browser on that origin `PUT`s the bytes straight to the session URI: CORS allows it and the browser can read the response (the new file's ID, name, size and `appProperties`). The bytes never touch the platform.
- With `drive.file` the server can read the file's metadata (including `appProperties` set when the session was created) and delete it.

## Decision

1. A `file` field (`accept`: any, images or documents; `maxSizeMb` 1–25, default 10; `maxFiles` 1–5, default 1) needs the form script; without it the field explains that.
2. For each chosen file the respondent's browser asks the forms domain for an upload slot (`POST /f/:formId/uploads` with field, name, size and type). The API checks them against the field, rate-limits per IP, makes sure the form has an upload folder in the owner's Drive (`<form title> — uploads`, created on first use), and creates a resumable session for the forms origin with `appProperties` `{ freelyForm, freelyField, freelyToken, freelyAttached: "0" }`, where `freelyToken` is a fresh random token. It returns the session URI and the token. Session URIs are capability secrets: they are never logged or stored.
3. The browser uploads directly to Google and puts `<fileId>:<token>` in the field's answer.
4. The queue consumer, which already acts for the owner, reads each file's metadata before writing the row. A file counts only if its `appProperties` match the form, the field and the token, and its size and type fit the field; it is then marked `freelyAttached: "1"`. The cell gets `name – https://drive.google.com/file/d/<id>/view` per file; a file that fails the check is written as `(file not accepted)`.
5. The hourly job deletes files in recently used upload folders that are still unattached a day after they were created.
6. The public form page allows `connect-src https://www.googleapis.com` only when the form has a file field.

## Consequences

- File bytes never pass through or rest on platform infrastructure; files live in the owner's Drive like the sheet.
- Each file costs two Drive calls in the consumer (read, mark attached), which counts against the per-invocation call budget (ADR 0014).
- Abuse of upload slots fills only the owner's own Drive and is bounded by the rate limit, size caps and the daily clean-up.
