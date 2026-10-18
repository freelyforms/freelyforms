-- ADR 0025: one custom domain per owner (Cloudflare for SaaS), and optional short paths for forms
-- on it. Only routing metadata: the hostname, Cloudflare's ID for it and its last known state.
CREATE TABLE custom_domains (
  owner_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hostname     TEXT NOT NULL UNIQUE CHECK (hostname = lower(hostname) AND hostname LIKE '%_._%'),
  cf_id        TEXT NOT NULL,                  -- Cloudflare custom hostname ID
  status       TEXT NOT NULL CHECK (status IN ('pending', 'active', 'failed')),
  detail       TEXT,                           -- Cloudflare's last status or error, for the owner
  checked_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
) STRICT;

-- `forms.acme.com/<slug>`; a form is always reachable by its ID as well.
ALTER TABLE forms ADD COLUMN slug TEXT CHECK (slug IS NULL OR (length(slug) BETWEEN 1 AND 64
  AND slug NOT GLOB '*[^a-z0-9-]*' AND slug NOT GLOB '-*' AND slug NOT GLOB '*-'));
CREATE UNIQUE INDEX forms_owner_slug ON forms(owner_id, slug) WHERE slug IS NOT NULL;
