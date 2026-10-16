-- Freely Forms metadata schema, version 1 (Cloudflare D1 / SQLite).
--
-- Privacy invariant: no table stores form answers or uploaded files. Encrypted
-- delivery payloads live in the queue and the short-lived hold store (ADR 0008),
-- never here. Timestamps are Unix epoch milliseconds.

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id          TEXT PRIMARY KEY,                 -- usr_…
  google_sub  TEXT NOT NULL UNIQUE,             -- stable Google account ID
  email       TEXT NOT NULL,
  name        TEXT,
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER
) STRICT;

-- Server-side sessions. Only a SHA-256 hash of the session token is stored.
CREATE TABLE sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

-- Google OAuth connection, separate from the app session.
-- refresh_token is an encrypted envelope (JSON) bound to the user ID.
CREATE TABLE google_connections (
  id               TEXT PRIMARY KEY,            -- gc_…
  user_id          TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  scopes           TEXT NOT NULL,               -- space-separated granted scopes
  refresh_token    TEXT NOT NULL,               -- envelope JSON, never plaintext
  status           TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'error')),
  last_checked_at  INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  CHECK (json_valid(refresh_token) AND json_extract(refresh_token, '$.v') IS NOT NULL)
) STRICT;

CREATE TABLE forms (
  id                 TEXT PRIMARY KEY,          -- frm_…
  owner_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  draft_json         TEXT NOT NULL CHECK (json_valid(draft_json)),
  published_version  INTEGER,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  CHECK ((status = 'published') = (published_version IS NOT NULL) OR status = 'archived')
) STRICT;
CREATE INDEX forms_owner ON forms(owner_id, updated_at);

-- Immutable published definitions. Never updated after insert.
CREATE TABLE form_versions (
  form_id       TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL CHECK (version >= 1),
  schema_json   TEXT NOT NULL CHECK (json_valid(schema_json)),
  published_at  INTEGER NOT NULL,
  PRIMARY KEY (form_id, version)
) STRICT;

CREATE TRIGGER form_versions_immutable
BEFORE UPDATE ON form_versions
BEGIN
  SELECT RAISE(ABORT, 'form_versions rows are immutable');
END;

-- Where responses are delivered (ADR 0005 destination states).
CREATE TABLE destinations (
  id               TEXT PRIMARY KEY,            -- dst_…
  form_id          TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('google_sheet')),
  spreadsheet_id   TEXT NOT NULL,
  sheet_id         INTEGER NOT NULL,            -- tab gid
  state            TEXT NOT NULL CHECK (state IN
                     ('OK', 'ACCESS_REVOKED', 'SHEET_DELETED', 'TAB_MISSING', 'COLUMN_MISSING', 'QUOTA')),
  last_error_code  TEXT,
  last_ok_at       INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
) STRICT;
CREATE INDEX destinations_form ON destinations(form_id);

-- Rebuildable cache of field → column, verified against developer metadata (ADR 0004).
CREATE TABLE column_map_cache (
  destination_id  TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  field_id        TEXT NOT NULL,
  column_index    INTEGER NOT NULL CHECK (column_index >= 0),
  verified_at     INTEGER NOT NULL,
  PRIMARY KEY (destination_id, field_id)
) STRICT;

-- Delivery state per submission (ADR 0003). Metadata only, no answers.
CREATE TABLE deliveries (
  submission_id    TEXT PRIMARY KEY,            -- ULID
  form_id          TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  form_version     INTEGER NOT NULL,
  destination_id   TEXT REFERENCES destinations(id) ON DELETE SET NULL,
  state            TEXT NOT NULL CHECK (state IN
                     ('accepted', 'queued', 'delivering', 'delivered', 'retrying',
                      'unknown', 'blocked', 'permanently_failed')),
  attempts         INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code  TEXT,
  accepted_at      INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,            -- accepted_at + 7 days: payload deadline (ADR 0008)
  delivered_at     INTEGER,
  sheet_range      TEXT,
  CHECK (expires_at > accepted_at),
  CHECK ((state = 'delivered') = (delivered_at IS NOT NULL))
) STRICT;
CREATE INDEX deliveries_form_state ON deliveries(form_id, state);
CREATE INDEX deliveries_expiry ON deliveries(state, expires_at);

-- Aggregate counters only.
CREATE TABLE form_daily_stats (
  form_id    TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  day        TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  views      INTEGER NOT NULL DEFAULT 0,
  starts     INTEGER NOT NULL DEFAULT 0,
  submits    INTEGER NOT NULL DEFAULT 0,
  delivered  INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (form_id, day)
) STRICT;
