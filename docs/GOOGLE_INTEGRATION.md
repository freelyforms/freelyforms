# Google Integration

## Components

Primary:

- Google Identity / OAuth 2.0;
- Google Sheets API;
- Google Drive API;
- Google Picker (attaching an existing sheet, ADR 0006).

Future optional integrations:

- Google Docs API;
- Gmail API;
- Google Workspace Marketplace.

## OAuth philosophy

Request the minimum scopes needed for the user's selected workflow.

Prefer file-scoped access patterns such as `drive.file` where they satisfy the feature. Do not request broad Drive access merely for convenience.

MVP scopes are `openid`, `email`, `profile` and `drive.file`; existing spreadsheets are attached through Google Picker ([ADR 0006](adr/0006-oauth-scopes-drive-file-picker.md), [ADR 0016](adr/0016-google-verification-non-sensitive-scopes.md)): Freely Forms adds its own tab to the picked spreadsheet. Respondent values are written as typed cells that Sheets never parses ([ADR 0002](adr/0002-raw-writes-for-respondent-data.md), [ADR 0013](adr/0013-delivery-refinements.md)); columns are identified by developer metadata ([ADR 0004](adr/0004-column-identity-developer-metadata.md)).

## Google Cloud setup

One Google Cloud project per environment (no organisation is required): `freelyforms-dev` for local development (Testing), `freelyforms-prod` for the hosted service (In production, ADR 0016). Each has:

- APIs enabled: Google Sheets API, Google Drive API, Google Picker API;
- a browser API key restricted to the Picker API and the site's origin, set as `PICKER_API_KEY`, and the project number as `GOOGLE_PROJECT_NUMBER` (the Picker's app ID, which is what grants `drive.file` access to the picked file); without them the builder hides nothing but reports that attaching is unavailable;
- Google Auth Platform: user type External, scopes `openid`, `email`, `profile`, `drive.file` (all non-sensitive);
- OAuth client of type Web application per environment; local development uses origin `http://localhost:8787` and redirect URI `http://localhost:8787/auth/google/callback`; the hosted service uses `https://freelyforms.com` and `https://freelyforms.com/auth/google/callback`;
- authorised domain `freelyforms.com`, verified in Google Search Console by a project owner; homepage `https://freelyforms.com/`, privacy policy `https://freelyforms.com/privacy`, terms `https://freelyforms.com/terms`;
- publishing status: an app in **Testing** accepts only listed test users, and its refresh tokens for scopes beyond the basic profile (here `drive.file`) expire after 7 days, which would block delivery weekly. Development projects may stay in Testing; the hosted service must be **In production**. With only non-sensitive scopes, production needs no security assessment or demo video, only brand verification (name, logo, domains, support email) to show the app's name and logo on the consent screen.

## Sign-in flow

1. `GET /auth/google/start` creates a random `state`, `nonce` and PKCE verifier, stores them in an encrypted, HttpOnly, 10-minute `__Host-` cookie and redirects to Google with the scopes above and `access_type=offline`.
2. `GET /auth/google/callback` checks `state`, exchanges the code (with the PKCE verifier) at Google's token endpoint and validates the ID token claims (`iss`, `aud`, `exp`, `nonce`, verified email).
3. The refresh token is stored only as an encrypted envelope bound to the user ID. If Google returns no refresh token and none is stored, the user is sent through the consent screen once (`prompt=consent`).
4. A server-side session starts: the browser gets a random token in an HttpOnly `__Host-` cookie; the database keeps only its SHA-256 hash.
5. Users who untick Drive access can still sign in; the connection records the granted scopes so the UI can ask for Drive access when it is needed.

State-changing requests must carry an `Origin` header matching the API origin.

## Spreadsheet ownership

A form may support two destinations:

1. Create a new Google Sheet.
2. Attach a user-selected compatible Sheet.

The application stores the spreadsheet ID and destination sheet/tab identity, not a copy of the response data.

## Default sheet shape

Recommended system columns followed by form fields:

```text
_submission_id | _submitted_at | _form_version | Name | Email | ...
```

Internally preserve a mapping between stable field IDs and sheet columns.

## Schema evolution

Changing a form after responses already exist must be safe.

Rules (status as of the MVP):

- new field -> append new column on publish (implemented);
- renamed field -> its column header is updated on the next publish, found by metadata, without changing field identity (implemented);
- deleted field -> retain historical column (implemented);
- column deleted by the owner -> recreated at the end on the next delivery ([ADR 0013](adr/0013-delivery-refinements.md));
- reordered field or column -> mapping follows developer metadata (implemented);
- duplicate labels -> allowed if field IDs differ; headers get a ` (2)` suffix (implemented);
- columns the owner adds by hand -> ignored by delivery; new field columns go after them (implemented).

## File uploads

Desired path:

```text
Google Drive/
  <App folder>/
    <Form name or ID>/
      uploads/
```

The app should write a Drive URL/reference into the response row.

## Disconnects and revoked access

The UI must detect and explain:

- OAuth revoked;
- spreadsheet deleted;
- spreadsheet access changed;
- Drive folder deleted;
- Google API quota/error;
- destination schema manually altered.

Never lose submissions silently. Failed delivery should be observable to the form owner. Destination states and owner-visible errors are defined in [ADR 0005](adr/0005-sheet-is-externally-mutable.md).

While access is revoked or disconnected, responses wait encrypted in the hold store for up to 7 days ([ADR 0011](adr/0011-hold-store-for-blocked-deliveries.md)). When the owner signs in again and grants Drive access, their `ACCESS_REVOKED` destinations become `OK` and the held responses are queued straight away; the hourly sweep sends any that one sign-in did not cover. Signing in without the Drive scope leaves them held.
