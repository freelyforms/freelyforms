# 0004. Column identity through Sheets developer metadata

Date: 2026-10-16

## Status
Accepted

## Context
Owners rename headers, reorder, insert and delete columns. Mapping fields to columns by header text or by fixed position breaks silently and writes answers into the wrong column.

## Decision
- Each response column carries Sheets `developerMetadata` with key `app_field_id` and the stable field ID from the form schema. Developer metadata moves with the column when the owner reorders columns.
- The platform caches `field_id → column index` per destination and rebuilds the cache from metadata when a write fails validation or the cache is stale.
- Header text is for humans only and may be changed freely by the owner.
- If a field's column is missing, the destination enters an explicit `COLUMN_MISSING` state. The platform never silently remaps to another column.
- New fields append a new column with metadata; deleted fields keep their historical column.

## Consequences
- Requires the `drive.file` scope to cover metadata operations on files the app created or the owner picked (ADR 0006).
- Manually created columns without metadata are ignored by delivery, which is safe.
