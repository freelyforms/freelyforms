# 0013. Delivery refinements found while implementing the MVP

Date: 2026-10-16

## Status

Accepted. Refines [ADR 0001](0001-batched-sheets-writes.md), [ADR 0004](0004-column-identity-developer-metadata.md) and [ADR 0011](0011-hold-store-for-blocked-deliveries.md).

## Context

Implementing the delivery path and auditing it showed five places where the earlier ADRs were either more specific than needed or wrong about the better behaviour.

## Decision

1. **Write call (ADR 0001).** Rows are appended with one `spreadsheets.batchUpdate` `AppendCells` request per batch, addressed by `sheetId`, instead of `values.append`. Typed cells (`stringValue`, `numberValue`, `boolValue`) are never parsed, which is how ADR 0002 is enforced, and the tab is found by its ID even after the owner renames it.
2. **Deleted field columns (ADR 0004).** When the column of a _field_ has been deleted by the owner, delivery adds a new column for that field (with developer metadata) at the end of the sheet and keeps writing. Answers still never go into another field's column. Only a missing _system_ column (`_submission_id`, `_submitted_at`, `_form_version`) puts the destination into `COLUMN_MISSING`, because reconciliation depends on them.
3. **Column cache (ADR 0004).** The `field_id → column` cache is deferred. Each batch reads developer metadata once (one read request per spreadsheet per batch); the cache is added when read quota becomes a constraint. The `column_map_cache` table is kept for that.
4. **Hold-store interface (ADR 0011).** The hosted Worker uses Workers KV directly. The interface is extracted when a second store (self-hosting) is implemented. Resuming works in chunks of 100 and the hourly job resumes again while a destination is `OK` but still has `blocked` deliveries, which covers KV listings that lag right after a fix.
5. **When to reconcile (ADR 0003).** Every retry of a delivery reads the `_submission_id` column before appending, not only retries whose last state was `unknown`. A later failure (a token refresh error, a block and resume, a crash during the append) can otherwise overwrite the evidence that an earlier append may have succeeded. First attempts, the common case, never read the sheet. Duplicate copies of one submission in the same batch are written once.

Not yet implemented, still required by the earlier ADRs: a per-owner concurrency cap (ADR 0001), owner notifications for blocked and expiring deliveries (ADR 0005, 0008, 0011), and periodic destination health checks (ADR 0005).

## Consequences

- An owner who deletes a column by mistake loses no responses; the column reappears at the end with its header.
- An owner who wants to stop collecting a field removes it from the form, not from the sheet.
