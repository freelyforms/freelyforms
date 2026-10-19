-- ADR 0026: forms whose owner asked for an email when responses arrive. A row means "on". The
-- email carries a count and links, never answers; last_sent_at throttles and marks what was told.
CREATE TABLE form_notifications (
  form_id       TEXT PRIMARY KEY REFERENCES forms(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  last_sent_at  INTEGER
) STRICT;
