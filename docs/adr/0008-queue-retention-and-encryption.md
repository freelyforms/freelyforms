# 0008. Queue retention of at most 7 days, encrypted payloads

Date: 2026-10-16

## Status

Accepted

## Context

To guarantee delivery when Google is unavailable or the owner's access is broken, a submission payload must exist somewhere between the submit endpoint and the owner's sheet. Without an explicit limit, a queue quietly becomes a submission store.

## Decision

- **Maximum retention: 7 days** from submission. This limit is published in the privacy policy.
- Payloads are encrypted at the application level with envelope encryption: a random data key per payload (AES-256-GCM), wrapped by a master key held outside the metadata database.
- Error classes:
  - **Transient** (429, 5xx, timeouts): automatic retries with backoff for up to 72 hours.
  - **Owner-actionable** (access revoked, sheet or tab deleted, column missing): delivery is blocked at once, the owner is notified by email and in the dashboard, and delivery resumes after the fix.
  - **Permanent** (invalid configuration): marked failed and alerted; the payload is kept until the deadline so it can be retried after a fix.
- After a confirmed write the payload is deleted immediately, not left to expire.
- An ambiguous write (ADR 0003) keeps the payload until reconciliation.
- At 7 days any undelivered payload and its data key are hard-deleted. The delivery record keeps only ID, status, timestamps and attempt counts.
- Files never travel through the queue (ADR 0007); messages carry structured answers and file references only.

## Consequences

- Privacy wording: "We do not keep a database of your form responses. A response may be held temporarily, encrypted, while it is being delivered to your Google Sheet. Undelivered responses are deleted automatically no later than 7 days after submission."
- An owner who leaves a destination broken for more than 7 days loses the undelivered responses; notifications must make this clear well before the deadline.
