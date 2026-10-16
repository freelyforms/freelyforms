import type { Form } from "@freelyforms/form-schema";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  GRANT_DRIVE_URL,
  type Deliveries,
  type DestinationState,
  type FormView,
} from "./api.js";
import type { FlushResult } from "./Editor.js";
import { pickSpreadsheet } from "./picker.js";

const DESTINATION_PROBLEMS: Record<Exclude<DestinationState, "OK">, string> = {
  ACCESS_REVOKED:
    "Freely Forms lost access to your Google account. Sign in again and allow Drive access, then resume delivery.",
  SHEET_DELETED:
    "The response sheet was deleted or moved to the bin. Restore it from the bin in Google Drive, then resume delivery.",
  TAB_MISSING:
    "The responses tab was deleted from the sheet. Restore it with the sheet's version history, then resume delivery.",
  COLUMN_MISSING:
    "A system column (_submission_id, _submitted_at or _form_version) was deleted. Restore it with the sheet's version history, then resume delivery.",
  QUOTA: "Google is limiting requests right now. Delivery continues automatically.",
};

const PUBLISH_ERRORS: Record<string, string> = {
  no_fields: "Add at least one field before publishing.",
  invalid_form: "Fix the highlighted problems before publishing.",
  google_access_required:
    "Freely Forms needs access to your Google Drive to create the response sheet.",
  destination_missing:
    "The response sheet is missing. Restore it in Google Drive, then publish again.",
  publish_conflict: "The form was published from another tab at the same time. Reload the page.",
  google_unavailable: "Google is not responding right now. Please try again in a minute.",
};

const ATTACH_ERRORS: Record<string, string> = {
  picker_unavailable: "Choosing an existing spreadsheet is not available on this server yet.",
  picker_script: "Google's file chooser could not be loaded. Check your connection or ad blocker.",
  google_access_required: "Freely Forms needs access to your Google Drive first.",
  sheet_not_accessible:
    "Freely Forms cannot open that spreadsheet. Choose it again in the file chooser.",
  destination_exists: "This form already has a response spreadsheet.",
};

const STATE_LABELS: Record<string, string> = {
  delivered: "delivered",
  queued: "waiting",
  accepted: "waiting",
  delivering: "being written",
  retrying: "retrying",
  unknown: "being checked",
  blocked: "on hold",
  permanently_failed: "failed",
};

interface Props {
  view: FormView;
  form: Form;
  fieldCount: number;
  saveState: string;
  flush: () => Promise<FlushResult>;
  onPublished: (view: FormView) => void;
  onDeleted: () => void;
}

const SAVE_ERRORS: Record<Exclude<FlushResult, "saved" | "stale">, string> = {
  invalid: "Fix the highlighted problems before publishing.",
  error: "Your latest changes could not be saved. Check your connection and try again.",
  signedOut: "Your session ended. Sign in again, then publish.",
};

/** Downloads the form definition as JSON (forms are always exportable). */
function exportJson(form: Form) {
  const blob = new Blob([JSON.stringify(form, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${form.id}.json`;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export function SharePanel({
  view,
  form,
  fieldCount,
  saveState,
  flush,
  onPublished,
  onDeleted,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Deliveries | null>(null);
  const [resumeNote, setResumeNote] = useState<string | null>(null);
  const [deliveriesError, setDeliveriesError] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const loadDeliveries = useCallback(() => {
    api.deliveries(view.id).then(
      (d) => {
        setDeliveries(d);
        setDeliveriesError(false);
      },
      () => {
        setDeliveriesError(true);
      },
    );
  }, [view.id]);

  useEffect(() => {
    if (view.status === "published") loadDeliveries();
  }, [view.status, loadDeliveries]);

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      // Save first; retry while edits keep arriving during the save.
      let saved: FlushResult = "stale";
      for (let i = 0; i < 3 && saved === "stale"; i++) saved = await flush();
      if (saved !== "saved") {
        setError(saved === "stale" ? SAVE_ERRORS.error : SAVE_ERRORS[saved]);
        return;
      }
      onPublished(await api.publish(view.id));
      loadDeliveries();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "network";
      setError(PUBLISH_ERRORS[code] ?? "Publishing failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    setBusy(true);
    setAttachError(null);
    try {
      const spreadsheetId = await pickSpreadsheet();
      if (spreadsheetId) onPublished(await api.attachSpreadsheet(view.id, spreadsheetId));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "picker_script";
      setAttachError(
        ATTACH_ERRORS[code] ?? "The spreadsheet could not be connected. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setBusy(true);
    try {
      const r = await api.resume(view.id);
      setResumeNote(
        r.resumed === 0
          ? "Delivery resumed. Nothing was waiting."
          : `${String(r.resumed)} response(s) sent to your sheet again.${r.more ? " More are on their way." : ""}`,
      );
      loadDeliveries();
    } catch {
      setResumeNote("Could not resume delivery. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const published = view.status === "published" && view.public;
  const needsPublish = !published || view.hasUnpublishedChanges || saveState !== "saved";
  const destinationState = deliveries?.destination?.state ?? view.destination?.state;
  const problem =
    destinationState && destinationState !== "OK" ? DESTINATION_PROBLEMS[destinationState] : null;
  const held = (deliveries?.counts.blocked ?? 0) > 0;

  return (
    <div className="share">
      <div className="card">
        <h2 className="small-heading">{published ? "Published" : "Not published yet"}</h2>
        <p className="muted">
          {published
            ? view.hasUnpublishedChanges || saveState !== "saved"
              ? "You have changes that respondents do not see yet."
              : "Respondents see the latest version."
            : "Publishing creates a Google Sheet for responses in your Drive and gives you a public link."}
        </p>
        <button
          type="button"
          className="primary"
          disabled={busy || fieldCount === 0 || !needsPublish}
          onClick={() => void publish()}
        >
          {busy ? "Publishing…" : published ? "Publish changes" : "Publish form"}
        </button>
        {fieldCount === 0 && <p className="muted small">Add at least one field first.</p>}
        {error && (
          <p className="alert" role="alert">
            {error}{" "}
            {error === PUBLISH_ERRORS.google_access_required && (
              <a href={GRANT_DRIVE_URL}>Grant access</a>
            )}
          </p>
        )}
      </div>

      {!view.destination && (
        <div className="card">
          <h2 className="small-heading">Where responses go</h2>
          <p className="muted">
            By default, publishing creates a new spreadsheet in your Drive. You can use one of your
            existing spreadsheets instead; Freely Forms adds its own tab and never changes your
            other tabs.
          </p>
          <button type="button" disabled={busy} onClick={() => void attach()}>
            Use an existing Google Sheet…
          </button>
          {attachError && (
            <p className="alert" role="alert">
              {attachError}{" "}
              {attachError === ATTACH_ERRORS.google_access_required && (
                <a href={GRANT_DRIVE_URL}>Grant access</a>
              )}
            </p>
          )}
        </div>
      )}

      {published && view.public && (
        <>
          <div className="card">
            <h2 className="small-heading">Link</h2>
            <CopyField label="Public link" value={view.public.url} />
            <p>
              <a href={view.public.url} target="_blank" rel="noopener">
                Open the form
              </a>
            </p>
          </div>
          <div className="card">
            <h2 className="small-heading">Embed on a website</h2>
            <p className="muted small">
              Paste this where the form should appear. It adjusts its height to the form.
            </p>
            <CopyField label="Embed code" value={view.public.embedCode} multiline />
          </div>
        </>
      )}

      {view.destination && (
        <div className="card">
          <h2 className="small-heading">Responses</h2>
          <p>
            Responses are written to{" "}
            <a href={view.destination.url} target="_blank" rel="noopener">
              your Google Sheet
            </a>
            , usually within seconds.
          </p>
          {problem && (
            <p className="alert" role="alert">
              {problem}
              {destinationState === "ACCESS_REVOKED" && (
                <>
                  {" "}
                  <a href={GRANT_DRIVE_URL}>Sign in again</a>
                </>
              )}
            </p>
          )}
          {deliveries && Object.keys(deliveries.counts).length > 0 && (
            <ul className="counts">
              {Object.entries(deliveries.counts).map(([state, n]) => (
                <li key={state}>
                  <strong>{n}</strong> {STATE_LABELS[state] ?? state}
                </li>
              ))}
            </ul>
          )}
          {deliveriesError && (
            <p className="alert" role="alert">
              Delivery status could not be loaded.
            </p>
          )}
          <p className="muted small">Last 30 days. Responses are never stored by Freely Forms.</p>
          {(problem || held) && (
            <button type="button" disabled={busy} onClick={() => void resume()}>
              I fixed it — resume delivery
            </button>
          )}
          {resumeNote && (
            <p className="muted" role="status">
              {resumeNote}
            </p>
          )}
          <button type="button" className="link" onClick={loadDeliveries}>
            Refresh
          </button>
        </div>
      )}

      <div className="card">
        <h2 className="small-heading">Export</h2>
        <p className="muted small">
          Download the form definition as JSON (schema version {form.schemaVersion}). Responses are
          already in your sheet.
        </p>
        <button
          type="button"
          onClick={() => {
            exportJson(form);
          }}
        >
          Download JSON
        </button>
      </div>

      <DeleteForm id={view.id} onDeleted={onDeleted} />
    </div>
  );
}

function CopyField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="copy">
      <label className="visually-hidden" htmlFor={`copy-${label}`}>
        {label}
      </label>
      {multiline ? (
        <textarea
          id={`copy-${label}`}
          readOnly
          rows={4}
          value={value}
          onFocus={(e) => {
            e.target.select();
          }}
        />
      ) : (
        <input
          id={`copy-${label}`}
          readOnly
          value={value}
          onFocus={(e) => {
            e.target.select();
          }}
        />
      )}
      <button type="button" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function DeleteForm({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(false);
  const remove = async () => {
    try {
      await api.deleteForm(id);
      onDeleted();
    } catch {
      setError(true);
    }
  };
  return (
    <div className="card danger-zone">
      <h2 className="small-heading">Delete form</h2>
      <p className="muted small">
        The form stops accepting responses. Your Google Sheet and its responses stay in your Drive.
      </p>
      {confirm ? (
        <>
          <button type="button" className="danger" onClick={() => void remove()}>
            Yes, delete this form
          </button>{" "}
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setConfirm(false);
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setConfirm(true);
          }}
        >
          Delete form…
        </button>
      )}
      {error && (
        <p className="alert" role="alert">
          The form could not be deleted. Please try again.
        </p>
      )}
    </div>
  );
}
