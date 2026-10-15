# Google Integration

## Components

Primary:

- Google Identity / OAuth 2.0;
- Google Sheets API;
- Google Drive API.

Future optional integrations:

- Google Docs API;
- Gmail API;
- Google Picker;
- Google Workspace Marketplace.

## OAuth philosophy
Request the minimum scopes needed for the user's selected workflow.

Prefer file-scoped access patterns such as `drive.file` where they satisfy the feature. Do not request broad Drive access merely for convenience.

## Spreadsheet ownership
A form may support two destinations:

1. Create a new Google Sheet.
2. Attach a user-selected compatible Sheet.

The application stores the spreadsheet ID and destination sheet/tab identity, not a copy of the response data.

## Default sheet shape
Recommended system columns followed by form fields:

```text
_submission_id | _submitted_at | Name | Email | ...
```

Internally preserve a mapping between stable field IDs and sheet columns.

## Schema evolution
Changing a form after responses already exist must be safe.

Rules to design:

- new field -> append new column;
- renamed field -> rename human header without changing field identity;
- deleted field -> retain historical column by default;
- reordered field -> do not destroy historical mapping;
- duplicate labels -> allowed if field IDs differ, but sheet headers need disambiguation.

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

Never lose submissions silently. Failed delivery should be observable to the form owner.
