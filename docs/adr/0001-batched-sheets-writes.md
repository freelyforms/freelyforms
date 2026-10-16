# 0001. Batch Google Sheets writes from the first release

Date: 2026-10-16

## Status
Accepted

## Context
The Google Sheets API limits write requests per Google Cloud project and per user per project (at the time of writing: 300 write requests per minute per project and 60 per minute per user per project). One popular form belonging to one owner can exceed the per-user limit on its own. Writing one row per request would make the quota, not our infrastructure, the scaling ceiling.

## Decision
- The delivery worker groups queued submissions by destination spreadsheet and flushes a batch every 250–1000 ms or when it reaches N rows, whichever comes first.
- One `spreadsheets.values.append` call per batch.
- Exponential backoff with jitter on HTTP 429 and 5xx; a per-owner concurrency cap; a dead-letter path for messages that exhaust retries.
- Batching is part of the MVP, not a later optimisation.

## Consequences
- Delivery to the sheet is near-real-time (sub-second to a few seconds), not synchronous. The respondent never waits for Google.
- Batch failures must be handled per batch and per row (see ADR 0003).
- A quota increase can still be requested later, but the design does not depend on it.
