# 0005. The owner's spreadsheet is an externally mutable database

Date: 2026-10-16

## Status

Accepted

## Context

The destination spreadsheet belongs to the owner, who can edit, rename, move, restore old versions, transfer ownership, delete it, or revoke our access at any moment. Treating it like a database we control leads to silent data loss.

## Decision

The Google integration is a reconciliation engine with explicit, owner-visible destination states:

| State            | Typical cause                   | Behaviour                                  |
| ---------------- | ------------------------------- | ------------------------------------------ |
| `OK`             | —                               | Deliver                                    |
| `ACCESS_REVOKED` | OAuth grant revoked or expired  | Block delivery, notify owner               |
| `SHEET_DELETED`  | File trashed or deleted         | Block, notify, offer to create a new sheet |
| `TAB_MISSING`    | Target tab deleted              | Block, notify, offer to recreate           |
| `COLUMN_MISSING` | Field column removed (ADR 0004) | Block, notify, offer to restore column     |
| `QUOTA`          | Google rate limits              | Retry with backoff (ADR 0001)              |

- Blocked submissions are held, encrypted, within the retention limit of ADR 0008 and resume when the owner fixes the problem.
- State changes are detected on write errors and by a lightweight periodic health check; they are never inferred from answer content.

## Consequences

- Every failure the owner can cause has a message, a fix action in the UI and a test.
- "Never lose submissions silently" becomes a testable property.
