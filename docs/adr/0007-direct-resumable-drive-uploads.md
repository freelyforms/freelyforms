# 0007. File uploads go directly to the owner's Drive

Date: 2026-10-16

## Status

Proposed — requires a spike before acceptance.

## Context

Proxying uploaded files through edge workers hits request-size and CPU limits and turns the platform into a file proxy that temporarily holds respondents' files.

## Decision (proposed)

1. The respondent's browser asks the API for an upload slot, sending file name, size and type.
2. The API validates them against the form schema, then creates a Drive resumable upload session in the owner's form folder using the owner's credentials.
3. The API returns the session URI to the browser, which uploads the bytes directly to Google.
4. After upload, the API verifies file metadata (size, MIME type, parent folder) and attaches the Drive file ID to the submission.
5. Session URIs are capability secrets: short-lived, single-use, never logged. Uploads not attached to a submission within a time limit are deleted.

## Spike must confirm

- CORS behaviour of resumable session URIs from third-party origins.
- Session lifetime, error and resume semantics in browsers.
- That `drive.file` covers files created through these sessions.
- Abuse limits: per-form size caps, per-IP rate limits, owner storage quota errors.

## Consequences

- File bytes never pass through or rest on platform infrastructure.
- If the spike fails, the fallback is a streamed proxy with strict size limits and no persistence; that would require a new ADR.
