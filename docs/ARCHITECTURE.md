# Architecture

## Architectural objective

Central infrastructure should coordinate the product without becoming the owner of user submission content.

## High-level flow

```text
Owner browser
   |
   | Google OAuth
   v
Application backend --------------------------+
   |                                          |
   | stores form schema + routing metadata    |
   |                                          |
   +------------------+-----------------------+
                      |
                      v
                Published form
                      |
Respondent --------> submit endpoint
                      |
                      +--> validation / anti-abuse
                      |
                      +--> queue
                              |
                              +--> Google Sheets API -> owner's spreadsheet
                              +--> Google Drive API  -> owner's Drive (files)
```

## Central application stores

The schema is defined by SQL migrations in `packages/db/migrations`; a test fails if any column name suggests answer or file content.

Allowed by default:

- user identity metadata;
- form metadata;
- versioned form definitions;
- public form ID/domain routing;
- encrypted OAuth refresh tokens or equivalent connection credentials;
- connection health/status;
- aggregate product analytics;
- operational delivery metadata that does not contain submission answers;
- webhook configuration;
- template metadata.

Avoid by default:

- raw form answers;
- uploaded files;
- copies of user spreadsheets;
- full webhook payload history containing answers.

## Submission delivery

Use asynchronous delivery where possible:

```text
POST /f/:formId   (freelyforms.link/<formId> on the forms domain, ADR 0010)
 -> validate schema
 -> rate limit / captcha where required
 -> accept submission
 -> enqueue durable delivery job
 -> return success state
 -> worker writes to Google
```

The implementation must define a reliable failure strategy. Suggested states:

- accepted;
- queued;
- delivering;
- delivered;
- retrying;
- unknown (request sent, no response — reconcile before retrying);
- blocked (owner action required);
- permanently_failed.

A submission payload may have to exist temporarily in a durable queue to guarantee delivery. It is encrypted at the application level and kept for at most 7 days ([ADR 0008](adr/0008-queue-retention-and-encryption.md)). Do not silently turn the queue into permanent storage.

Delivery states, the `blocked` and `unknown` states and reconciliation of ambiguous writes are defined in [ADR 0003](adr/0003-delivery-states-and-reconciliation.md). Deliveries blocked by an owner-fixable problem wait in a key-value store with automatic expiry, not in the queue ([ADR 0011](adr/0011-hold-store-for-blocked-deliveries.md)).

## Implemented delivery path

```text
POST /f/:formId (freelyforms.link/<formId> in production)
 -> load the published version; validate (form-engine); honeypot
 -> deliveries row (accepted → queued), encrypted payload → DELIVERY_QUEUE
 -> success page (or 201 JSON)
Queue consumer (same Worker, ADR 0012; batches of up to 50):
 -> group by form; refresh the owner's access token
 -> resolve columns by developer metadata, add columns for new fields
 -> on a retry, reconcile by _submission_id first (ADR 0013)
 -> one AppendCells request per group → delivered
 -> retryable error: retry with backoff (≤ 72 h; past the queue's retention, wait in KV, ADR 0014);
    owner-actionable: hold in KV → blocked
 -> at most GOOGLE_CALL_BUDGET Google calls per invocation; the rest go back to the queue
POST /forms/:id/deliveries/resume re-queues held deliveries after the owner fixes the sheet.
Hourly cron enforces the 7-day deadline, deletes expired sessions, prunes delivery records and
resumes held deliveries a lagging KV listing missed.
```

## Idempotency

Each accepted submission gets a globally unique submission ID. Google delivery must be idempotent or deduplicatable.

Recommended sheet columns maintained by the platform:

- `_submission_id`
- `_submitted_at`
- `_form_version`
- optional `_source_url`
- optional UTM/hidden fields configured by owner

## Scaling rule

Optimise first for correctness and delivery reliability. Google Sheets writes are batched per spreadsheet from the first release, because Sheets API per-user quotas are reachable by a single popular form ([ADR 0001](adr/0001-batched-sheets-writes.md)).

## Multi-tenancy

Every resource must be scoped by account/workspace ownership. Avoid relying only on client-provided IDs.

## Public rendering

Public renderer should be highly cacheable except for dynamic form state. Static form definition/version can be cached at the edge. Published forms are served from a separate domain, `freelyforms.link` ([ADR 0010](adr/0010-separate-domain-for-public-forms.md)).

## Custom domains

Design routing so custom domains can be added later without restructuring form identity.

## Self-hosting

Do not make hosted-only assumptions in core packages. Separate vendor-specific edge bindings from business logic.
