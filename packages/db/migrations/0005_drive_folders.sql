-- ADR 0007: the Drive folder each form's uploaded files go to (created on first use), and when the
-- form last handed out an upload slot, so the hourly clean-up only visits recently used folders.
-- Only IDs and times: no file names or contents.
CREATE TABLE drive_folders (
  form_id       TEXT PRIMARY KEY REFERENCES forms(id) ON DELETE CASCADE,
  folder_id     TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER NOT NULL
) STRICT;
