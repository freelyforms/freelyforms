# 0026. Owner email notifications

Date: 2026-10-19

## Status

Accepted.

## Context

Owners learn about new responses only by opening their sheet. An email is expected of any form tool, but the platform must not move answers anywhere new (CLAUDE.md), and sending from the owner's Gmail would need a sensitive Google scope and another verification.

## Decision

- **Opt-in per form.** The owner turns on "Email me when responses arrive" on the Publish tab; a row in `form_notifications(form_id, created_at, last_sent_at)` means on. The email goes to the owner's account email; members don't get emails yet.
- **No answers in email.** The email names the form and how many responses arrived, and links to the sheet and the form in the app. Answers stay in the owner's sheet.
- **When.** After a batch is written to the sheet, owners of those forms are emailed if their last email was at least 15 minutes ago; the count covers every response delivered since. The hourly cron sends what the window held back. `last_sent_at` is set before sending, so a crash can't repeat an email; a failed send is logged by error name only and never affects delivery.
- **Sending.** Cloudflare Email Service through a `send_email` binding (`EMAIL`) from an address on an onboarded domain (`NOTIFY_FROM`). It sends to arbitrary recipients only on Workers Paid (3,000 emails a month included); without the binding the option is hidden.
- **Unsubscribe.** Each email links to `/notifications/off` with an HMAC of the form ID (key derived from the master key with HKDF). Opening it shows a button; only the POST turns emails off, so link scanners can't.

## Consequences

- Owners hear about responses without a new Google permission and without answers leaving the sheet.
- Email volume is bounded per form (at most four an hour) and needs Workers Paid in production.
- Emails to members, digests, and sending from the owner's own Gmail or SMTP can follow.
