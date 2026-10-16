# 0011. Blocked deliveries wait in a TTL key-value store, not in the queue

Date: 2026-10-16

## Status

Accepted. Refines [ADR 0008](0008-queue-retention-and-encryption.md).

## Context

ADR 0008 allows an undelivered response to be held, encrypted, for at most 7 days. Two kinds of waiting differ:

- **Transient errors** (429, 5xx, timeouts) clear on their own within minutes or hours.
- **Owner-actionable errors** (access revoked, sheet or tab deleted, column missing) last until the owner acts, which can take days.

Cloudflare Queues (checked 2026-10-16) retains messages for at most 14 days on Workers Paid and 24 hours on Workers Free, allows at most 100 retries and delays of at most 24 hours. Keeping blocked messages in the queue would mean re-delivering them repeatedly with nothing to do, and a fixed destination would wait for the next retry instead of resuming at once. Storing payloads in the metadata database would break its "no answers" invariant (a test enforces it).

## Decision

- **Transient errors stay in the queue** with exponential backoff, for up to 72 hours (ADR 0008).
- **Owner-actionable errors move the payload to a hold store**: Workers KV, key `hold:<destinationId>:<submissionId>`, value = the encrypted envelope, `expiration` = the delivery's `expires_at` (submission time + 7 days). The queue message is then acknowledged and the delivery state becomes `blocked`.
- **When the owner fixes the destination**, the API lists `hold:<destinationId>:` keys and re-enqueues each envelope; the key is deleted after the re-enqueue succeeds.
- **Expiry is enforced by the platform**: KV deletes the key at its expiration and it can no longer be read, even if our own cleanup job fails. A periodic job marks overdue deliveries `permanently_failed` and notifies the owner.
- The queue itself is configured with a message retention period of 7 days, so no path keeps a payload longer than ADR 0008 allows.
- The hold store is behind a small interface (`put`, `listByDestination`, `delete`) so self-hosted deployments can use another store with TTL (for example Redis).

## Consequences

- The hosted service requires Workers Paid (queue retention above 24 hours).
- Fixing a destination resumes delivery within seconds.
- KV is eventually consistent (a new key can take up to about a minute to appear in listings in other locations); resuming may need one retry, which is acceptable.
- A held payload is still subject to envelope encryption with associated data bound to the submission ID (ADR 0008).
