import { useState } from "react";
import { api, ApiError, GRANT_DRIVE_URL, type Me } from "./api.js";
import { CustomDomainCard } from "./Domain.js";

/** Google connection and account deletion (docs/SECURITY_PRIVACY.md, Data deletion). */
export function Account({ me, onChange }: { me: Me; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
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
      setConfirmDisconnect(false);
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
      const r = await api.deleteAccount(confirm);
      window.location.assign(`/app/?deleted=${r.revokedAtGoogle ? "1" : "unconfirmed"}`);
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
      <div className="page-head">
        <div>
          <h1>Account</h1>
          <p className="muted">
            {me.user.name ? `${me.user.name} · ${me.user.email}` : me.user.email}
          </p>
        </div>
      </div>

      <section className="card">
        <h2 className="section-title">Google connection</h2>
        {connected ? (
          <>
            <p className="status-line">
              <span className={`status ${me.google.driveAccess ? "ok" : "warn"}`}>
                {me.google.driveAccess ? "Google Drive connected" : "Drive access not granted"}
              </span>
            </p>
            <p className="helper">
              Freely Forms can only open the spreadsheets it creates or that you choose for it.
            </p>
            {!me.google.driveAccess && (
              <p>
                <a className="button primary" href={GRANT_DRIVE_URL}>
                  Grant Drive access
                </a>
              </p>
            )}
            {confirmDisconnect ? (
              <div className="confirm">
                <p>
                  Delivery to your sheets stops until you sign in again. Responses wait, encrypted,
                  for up to 7 days and are then deleted.
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={() => void disconnect()}
                  >
                    Disconnect
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setConfirmDisconnect(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirmDisconnect(true);
                }}
              >
                Disconnect Google Drive
              </button>
            )}
          </>
        ) : (
          <>
            <p className="status-line">
              <span className="status warn">Not connected</span>
            </p>
            <p className="helper">Responses to your forms are waiting, not delivered.</p>
            <a className="button primary" href={GRANT_DRIVE_URL}>
              Connect Google Drive
            </a>
          </>
        )}
        {note && (
          <p className="muted" role="status">
            {note}
          </p>
        )}
      </section>

      <CustomDomainCard />

      <section className="zone">
        <h2 className="section-title danger-text">Danger zone</h2>
        <div className="card danger-zone">
          <h3 className="item-title">Delete account</h3>
          <ul className="helper-list">
            <li>Deletes your Freely Forms account, your forms and their history.</li>
            <li>Revokes our Google access and discards responses still waiting for delivery.</li>
            <li>Your Google Sheets and the responses in them stay in your Drive.</li>
          </ul>
          <label className="field-label" htmlFor="confirm-email">
            Type your email to confirm
          </label>
          <p className="helper">
            <code>{me.user.email}</code>
          </p>
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
      </section>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <p className="small muted">
        <a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of use</a>
      </p>
    </main>
  );
}
