# Architecture Decision Records

Each ADR records one decision: the context, what we decided and what follows from it. ADRs are immutable once accepted; a later decision supersedes an earlier one with a new ADR that links back.

| #                                                  | Decision                                                           | Status                           |
| -------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------- |
| [0001](0001-batched-sheets-writes.md)              | Batch Google Sheets writes from the first release                  | Accepted (refined by 0013)       |
| [0002](0002-raw-writes-for-respondent-data.md)     | Write respondent data with `RAW` value input only                  | Accepted                         |
| [0003](0003-delivery-states-and-reconciliation.md) | Delivery states and reconciliation of ambiguous writes             | Accepted                         |
| [0004](0004-column-identity-developer-metadata.md) | Column identity through Sheets developer metadata                  | Accepted (refined by 0013)       |
| [0005](0005-sheet-is-externally-mutable.md)        | The owner's spreadsheet is an externally mutable database          | Accepted                         |
| [0006](0006-oauth-scopes-drive-file-picker.md)     | OAuth scopes: `drive.file` and Google Picker only                  | Accepted                         |
| [0007](0007-direct-resumable-drive-uploads.md)     | File uploads go directly to the owner's Drive                      | Proposed (spike required)        |
| [0008](0008-queue-retention-and-encryption.md)     | Queue retention of at most 7 days, encrypted payloads              | Accepted                         |
| [0009](0009-license-apache-2-and-cla.md)           | Apache-2.0 licence with a Contributor License Agreement            | Accepted                         |
| [0010](0010-separate-domain-for-public-forms.md)   | Public forms are served from a separate domain                     | Accepted                         |
| [0011](0011-hold-store-for-blocked-deliveries.md)  | Blocked deliveries wait in a TTL key-value store, not in the queue | Accepted (refined by 0013, 0014) |
| [0012](0012-single-worker-for-mvp.md)              | One Worker for the API, public forms and delivery in the MVP       | Accepted                         |
| [0013](0013-delivery-refinements.md)               | Delivery refinements found while implementing the MVP              | Accepted                         |
| [0014](0014-run-on-workers-free.md)                | The hosted beta runs on Workers Free                               | Accepted                         |

Template: copy any ADR and keep the sections _Status_, _Context_, _Decision_, _Consequences_.
