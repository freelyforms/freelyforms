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
          : `${String(r.resumed)} ${r.resumed === 1 ? "response" : "responses"} sent to your sheet again.${r.more ? " More are on their way." : ""}`,
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

  const upToDate = published && !needsPublish;
  const delivered = deliveries?.counts.delivered ?? 0;
  const waiting = Object.entries(deliveries?.counts ?? {})
    .filter(([state]) => state !== "delivered" && state !== "permanently_failed")
    .reduce((n, [, c]) => n + (c ?? 0), 0);
  const failed = deliveries?.counts.permanently_failed ?? 0;

  return (
    <div className="stack">
      <section className="card">
        <div className="status-row">
          <span className={`status ${published ? (upToDate ? "ok" : "warn") : "draft"}`}>
            {published ? (upToDate ? "Live · up to date" : "Live · unpublished changes") : "Draft"}
          </span>
          <span className="spacer" />
          {upToDate ? (
            <span className="muted small">Respondents see the latest version</span>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={busy || fieldCount === 0}
              onClick={() => void publish()}
            >
              {busy ? "Publishing…" : published ? "Publish changes" : "Publish form"}
            </button>
          )}
        </div>
        {!published && (
          <p className="helper">
            Publishing gives you a public link and starts sending responses to a Google Sheet.
          </p>
        )}
        {fieldCount === 0 && <p className="helper">Add at least one field first.</p>}
        {error && (
          <p className="alert" role="alert">
            {error}{" "}
            {error === PUBLISH_ERRORS.google_access_required && (
              <a href={GRANT_DRIVE_URL}>Grant access</a>
            )}
          </p>
        )}
      </section>

      {published && view.public && (
        <section className="card">
          <h2 className="section-title">Share</h2>
          <span className="field-label">Public link</span>
          <CopyField label="Public link" value={view.public.url} openUrl={view.public.url} />
          <span className="field-label">Embed on a website</span>
          <CopyField label="Embed code" value={view.public.embedCode} multiline />
          <p className="helper">Paste it where the form should appear; it adjusts its height.</p>
        </section>
      )}

      <section className="card">
        <h2 className="section-title">Delivery</h2>
        {view.destination ? (
          <>
            <div className="dest-row">
              <span>
                <span className="muted">Destination</span> · Google Sheets
              </span>
              <span className="spacer" />
              <a className="button" href={view.destination.url} target="_blank" rel="noopener">
                Open sheet
              </a>
            </div>
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
            {deliveries && (
              <p className="delivery-summary">
                <strong>{delivered}</strong> {delivered === 1 ? "response" : "responses"} delivered
                in the last 30 days
                {waiting > 0 && (
                  <>
                    {" "}
                    · <strong>{waiting}</strong> waiting
                  </>
                )}
                {failed > 0 && (
                  <>
                    {" "}
                    · <strong>{failed}</strong> not delivered
                  </>
                )}
              </p>
            )}
            {deliveriesError && (
              <p className="alert" role="alert">
                Delivery status could not be loaded.
              </p>
            )}
            <div className="row">
              {(problem || held) && (
                <button type="button" disabled={busy} onClick={() => void resume()}>
                  I fixed it — resume delivery
                </button>
              )}
              <button type="button" className="ghost small" onClick={loadDeliveries}>
                Refresh
              </button>
            </div>
            {resumeNote && (
              <p className="muted" role="status">
                {resumeNote}
              </p>
            )}
            <p className="helper">
              Responses are written to your sheet, usually within seconds. Freely Forms does not
              keep delivered responses.
            </p>
          </>
        ) : (
          <>
            <p>
              Publishing creates a new spreadsheet in your Drive. You can use one of your existing
              spreadsheets instead; Freely Forms adds its own tab and never changes your other tabs.
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
          </>
        )}
      </section>

      <section className="zone">
        <h2 className="section-title">Advanced</h2>
        <div className="card">
          <div className="dest-row">
            <span>
              Export the form as JSON{" "}
              <span className="muted small">(schema v{form.schemaVersion})</span>
            </span>
            <span className="spacer" />
            <button
              type="button"
              onClick={() => {
                exportJson(form);
              }}
            >
              Download JSON
            </button>
          </div>
        </div>
        <DeleteForm id={view.id} onDeleted={onDeleted} />
      </section>
    </div>
  );
}

function CopyField({
  label,
  value,
  multiline = false,
  openUrl,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  openUrl?: string;
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
    <div className={multiline ? "copy multiline" : "copy"}>
      <label className="visually-hidden" htmlFor={`copy-${label}`}>
        {label}
      </label>
      {multiline ? (
        <textarea
          id={`copy-${label}`}
          className="readonly"
          readOnly
          rows={5}
          value={value}
          onFocus={(e) => {
            e.target.select();
          }}
        />
      ) : (
        <input
          id={`copy-${label}`}
          className="readonly"
          readOnly
          value={value}
          onFocus={(e) => {
            e.target.select();
          }}
        />
      )}
      <div className="copy-actions">
        <button type="button" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
        {openUrl && (
          <a className="button" href={openUrl} target="_blank" rel="noopener">
            Open
          </a>
        )}
      </div>
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
      <h3 className="item-title">Delete form</h3>
      <p className="helper">
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
          className="danger-outline"
          onClick={() => {
            setConfirm(true);
          }}
        >
          Delete form
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
