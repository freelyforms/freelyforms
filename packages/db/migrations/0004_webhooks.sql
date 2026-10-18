-- ADR 0021: one webhook per form, next to the sheet. Only metadata; no response content.
CREATE TABLE webhooks (
  id               TEXT PRIMARY KEY,            -- whk_…
  form_id          TEXT NOT NULL UNIQUE REFERENCES forms(id) ON DELETE CASCADE,
  url              TEXT NOT NULL,
  secret           TEXT NOT NULL,               -- encrypted envelope (JSON), bound to webhook:<id>
  failing          INTEGER NOT NULL DEFAULT 0 CHECK (failing IN (0, 1)),
  last_status      INTEGER,                     -- HTTP status of the last attempt, 0 for network errors
  last_attempt_at  INTEGER,
  last_ok_at       INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
) STRICT;
