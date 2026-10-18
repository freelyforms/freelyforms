# 0024. Collaborators and the responses view

Date: 2026-10-18

## Status

Accepted.

## Context

Owners want teammates to work on a form and look at its responses without handing over their Google account or sharing the spreadsheet in Drive. Responses live only in the owner's sheet (ADR 0002, ADR 0005), and the platform must not keep them (CLAUDE.md).

## Decision

- **Members per form.** An owner adds people by email with a role: `viewer` (sees the form and its responses) or `editor` (also edits and publishes the form and corrects response cells). Only the owner manages members, the destination sheet, the webhook and deletion; the owner is not a member row. No invitation emails: the person signs in with Google using that address and the form appears in their list. Members are stored as `form_members(form_id, email, role, created_at)`; email is lowercased.
- **Responses view.** `GET /forms/:id/responses` reads the form's responses tab with the owner's Google access at the moment a member (or the owner) looks: the header and a page of rows (newest first, 50 per page), mapped to fields by the column identities of ADR 0004. Nothing is cached or stored; responses are `Cache-Control: no-store`. Editors and the owner can change one answer cell (`PATCH /forms/:id/responses/:submissionId`), found by `_submission_id` so moved rows don't matter; it is written `RAW` (ADR 0002). System columns can't be edited.
- **Everything happens as the owner.** If the owner disconnects Google, members see that responses are unavailable. Reads count against the owner's Sheets quota; pages keep it small.
- **Privacy.** The privacy policy says that people the owner invites can see and correct the responses through the app.

## Consequences

- Teams work without access to the owner's Drive, and the owner can remove someone at any time.
- The app now shows response content to signed-in members, so every response route checks membership and role on each request.
- Owner transfer, member-level audit logs and more roles can come later.
