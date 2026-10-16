# Security and Privacy

## Privacy claim

The product may eventually market itself around not centrally storing submission content. Engineering must make this claim materially true.

## OAuth token handling

- encrypt refresh tokens at rest;
- encryption key must not live in the same plaintext database;
- never send refresh tokens to the browser;
- never log access or refresh tokens;
- support token revocation/disconnect;
- minimise scopes;
- document data use clearly for OAuth verification.

Implementation: `packages/crypto` provides envelope encryption (AES-256-GCM via Web Crypto) with a fresh data key per value, a master key held as a deployment secret, associated data that binds each ciphertext to its owner (user ID for tokens, submission ID for queued payloads), and key rotation through a keyring and `rewrap`.

## Submission data

Transient handling is allowed only where operationally necessary for reliable delivery.

Requirements:

- queue retention of at most 7 days with application-level envelope encryption ([ADR 0008](adr/0008-queue-retention-and-encryption.md));
- no analytics derived from answer content by default;
- no application logs containing answers;
- scrub exception/error reporting;
- automatic retries for transient Google errors for up to 72 hours;
- delete failed payloads after the retention policy and report failure state to owner.

## Uploaded files

Do not permanently proxy-store uploads unless technically unavoidable. Temporary staging must have automatic expiry.

## Public form abuse controls

- per-IP and per-form rate limiting;
- bot protection/Turnstile where risk warrants;
- payload size limits;
- file type/size validation;
- owner-configurable duplicate protection later;
- honeypot support is acceptable but not sufficient by itself.

## Implemented intake protection

- Cloudflare Turnstile on every public form when the deployment sets `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`; the token is verified server-side and never stored.
- Workers Rate Limiting per IP and per IP and form; over the limit returns 429 with `Retry-After`.
- Honeypot field, 64 KB body limit, schema validation before anything is queued.
- Form pages: nonce-based CSP, no third-party scripts except the Turnstile widget, `noindex`, `no-store`; framing allowed for embeds. App pages: `frame-ancestors 'none'`.

## Web security baseline

- CSP;
- secure cookies;
- CSRF protection where state-changing browser requests need it;
- strict CORS policy;
- output encoding;
- schema validation server-side;
- no HTML injection from field labels/descriptions without sanitisation;
- dependency scanning;
- secret scanning;
- security headers.

## Data deletion

Account deletion should remove central metadata and revoke/delete stored connection credentials. User-owned Sheets/Drive files should not be deleted unless the user explicitly requests that operation and understands it.

## Open-source safety

No secrets, cloud IDs that confer access, private strategy, production credentials, or user data belong in the repository.
