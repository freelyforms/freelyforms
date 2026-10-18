-- ADR 0024: people an owner shares a form with, by the email they sign in with. Roles only; no
-- invitation emails are sent and nothing about responses is stored.
CREATE TABLE form_members (
  form_id     TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  email       TEXT NOT NULL CHECK (email = lower(email) AND email LIKE '%_@_%'),
  role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (form_id, email)
) STRICT;
CREATE INDEX form_members_by_email ON form_members(email);
