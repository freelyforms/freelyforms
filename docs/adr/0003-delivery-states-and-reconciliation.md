# 0003. Delivery states and reconciliation of ambiguous writes

Date: 2026-10-16

## Status

Accepted

## Context

`spreadsheets.values.append` has no idempotency key. If a request times out without a response, the row may or may not have been written; blindly retrying can duplicate it, and giving up can lose it. Reading the sheet before every retry would waste read quota during incidents, exactly when quota is scarce.

## Decision

- Each accepted submission gets a ULID `submission_id`, written to the hidden system column `_submission_id`.
- The central database keeps one delivery record per submission with no answer content: `accepted → queued → delivering → delivered`, plus `retrying`, `unknown`, `blocked` and `permanently_failed`, attempt count, last error code and the written range.
- A clear error response (429, 5xx with a response, structural 4xx) is retried or blocked based on internal state alone.
- Only `unknown` (request sent, no response) triggers reconciliation: read the `_submission_id` column for the target range, mark found IDs `delivered`, and retry the rest.
- Delivery records contain metadata only and are pruned after a fixed period.

## Consequences

- Guarantee: at-least-once delivery, deduplicated on ambiguity, which is effectively-once in the sheet.
- The `_submission_id` column is required; if the owner deletes it, the destination enters an error state (ADR 0005).
- Owners can see per-form delivery health without the platform storing answers.
