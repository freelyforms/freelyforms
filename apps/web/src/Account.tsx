import { useState } from "react";
import { api, ApiError, GRANT_DRIVE_URL, type Me } from "./api.js";

/** Google connection and account deletion (docs/SECURITY_PRIVACY.md, Data deletion). */
export function Account({ me, onChange }: { me: Me; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const connected = me.google.status === "active";

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.disconnectGoogle();
      setNote(
        r.revokedAtGoogle
          ? "Google is disconnected. Freely Forms can no longer reach your Drive."
          : "We deleted our copy of your Google access, but Google did not confirm the revocation. You can also remove Freely Forms at myaccount.google.com/permissions.",
      );
      onChange();
    } catch {
      setError("Google could not be disconnected. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(confirm);
      window.location.assign("/app/");
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "confirmation_required"
          ? "Type your account email exactly to confirm."
          : "Your account could not be deleted. Please try again.",
      );
      setBusy(false);
    }
  };

  return (
    <main className="page account">
      <h1>Account</h1>
      <div className="card">
        <h2 className="small-heading">Signed in as</h2>
        <p>{me.user.name ? `${me.user.name} · ${me.user.email}` : me.user.email}</p>
      </div>

      <div className="card">
        <h2 className="small-heading">Google connection</h2>
        {connected ? (
          <>
            <p>
              {me.google.driveAccess
                ? "Freely Forms can create and update the response sheets it made in your Drive. It cannot see anything else in your Drive."
                : "Freely Forms does not have Drive access yet, so it cannot create response sheets."}
            </p>
            {!me.google.driveAccess && (
              <p>
                <a className="button primary" href={GRANT_DRIVE_URL}>
                  Grant Drive access
                </a>
              </p>
            )}
            <p className="muted small">
              Disconnecting revokes our access at Google. Your published forms keep accepting
              responses; they wait, encrypted, for up to 7 days until you sign in again, and are
              deleted after that.
            </p>
            <button type="button" disabled={busy} onClick={() => void disconnect()}>
              Disconnect Google
            </button>
          </>
        ) : (
          <>
            <p>Google is not connected. Responses to your forms are waiting, not delivered.</p>
            <a className="button primary" href={GRANT_DRIVE_URL}>
              Connect Google
            </a>
          </>
        )}
        {note && (
          <p className="muted" role="status">
            {note}
          </p>
        )}
      </div>

      <div className="card danger-zone">
        <h2 className="small-heading">Delete account</h2>
        <p>
          Deletes your account, your forms and their history from Freely Forms, revokes our Google
          access and discards responses still waiting for delivery. Your Google Sheets and the
          responses in them stay in your Drive.
        </p>
        <label className="field-label" htmlFor="confirm-email">
          Type <strong>{me.user.email}</strong> to confirm
        </label>
        <input
          id="confirm-email"
          autoComplete="off"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
          }}
        />
        <p>
          <button
            type="button"
            className="danger"
            disabled={busy || confirm.trim().toLowerCase() !== me.user.email.toLowerCase()}
            onClick={() => void remove()}
          >
            Delete my account
          </button>
        </p>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
