# Architecture Decision Records

Each ADR records one decision: the context, what we decided and what follows from it. ADRs are immutable once accepted; a later decision supersedes an earlier one with a new ADR that links back.

| #                                                        | Decision                                                           | Status                           |
| -------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------- |
| [0001](0001-batched-sheets-writes.md)                    | Batch Google Sheets writes from the first release                  | Accepted (refined by 0013)       |
| [0002](0002-raw-writes-for-respondent-data.md)           | Write respondent data with `RAW` value input only                  | Accepted (refined by 0013)       |
| [0003](0003-delivery-states-and-reconciliation.md)       | Delivery states and reconciliation of ambiguous writes             | Accepted (refined by 0013)       |
| [0004](0004-column-identity-developer-metadata.md)       | Column identity through Sheets developer metadata                  | Accepted (refined by 0013)       |
| [0005](0005-sheet-is-externally-mutable.md)              | The owner's spreadsheet is an externally mutable database          | Accepted                         |
| [0006](0006-oauth-scopes-drive-file-picker.md)           | OAuth scopes: `drive.file` and Google Picker only                  | Accepted (refined by 0016)       |
| [0007](0007-direct-resumable-drive-uploads.md)           | File uploads go directly to the owner's Drive                      | Accepted (spike 2026-10-18)      |
| [0008](0008-queue-retention-and-encryption.md)           | Queue retention of at most 7 days, encrypted payloads              | Accepted                         |
| [0009](0009-license-apache-2-and-cla.md)                 | Apache-2.0 licence with a Contributor License Agreement            | Accepted                         |
| [0010](0010-separate-domain-for-public-forms.md)         | Public forms are served from a separate domain                     | Accepted                         |
| [0011](0011-hold-store-for-blocked-deliveries.md)        | Blocked deliveries wait in a TTL key-value store, not in the queue | Accepted (refined by 0013, 0014) |
| [0012](0012-single-worker-for-mvp.md)                    | One Worker for the API, public forms and delivery in the MVP       | Accepted (refined by 0015)       |
| [0013](0013-delivery-refinements.md)                     | Delivery refinements found while implementing the MVP              | Accepted                         |
| [0014](0014-run-on-workers-free.md)                      | The hosted beta runs on Workers Free                               | Accepted                         |
| [0015](0015-website-in-the-api-worker.md)                | The public website is server-rendered in the API Worker            | Accepted                         |
| [0016](0016-google-verification-non-sensitive-scopes.md) | Google verification for the production app                         | Accepted                         |
| [0017](0017-conditional-field-visibility.md)             | Conditional field visibility                                       | Accepted                         |
| [0018](0018-multi-page-forms.md)                         | Multi-page forms                                                   | Accepted                         |
| [0019](0019-conditional-required.md)                     | Questions required only under conditions                           | Accepted                         |
| [0020](0020-answer-formats.md)                           | Answer formats instead of regular expressions                      | Accepted                         |
| [0021](0021-webhook-destination.md)                      | Webhook destination                                                | Accepted                         |
| [0022](0022-calculations-and-scores.md)                  | Calculations and option scores                                     | Accepted                         |
| [0023](0023-matrix-and-ranking.md)                       | Matrix and ranking fields                                          | Accepted                         |
| [0024](0024-collaborators-and-responses-view.md)         | Collaborators and the responses view                               | Accepted                         |
| [0025](0025-custom-domains.md)                           | Custom domains                                                     | Accepted                         |
| [0026](0026-owner-notifications.md)                      | Owner email notifications                                          | Accepted                         |

Template: copy any ADR and keep the sections _Status_, _Context_, _Decision_, _Consequences_.
