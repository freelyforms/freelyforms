import { useEffect, useId, useState } from "react";
import { api, ApiError, type DomainState } from "./api.js";

const PROBLEMS: Record<string, string> = {
  invalid_hostname: "Enter a domain name such as forms.example.com.",
  hostname_not_allowed: "That domain belongs to Freely Forms. Use one of your own.",
  hostname_taken: "That domain is already connected somewhere else.",
  hostname_rejected: "Cloudflare did not accept that domain. Check the name and try again.",
  domain_exists: "Remove your current domain first.",
  cloudflare_unavailable: "Custom domains can't be reached right now. Please try again later.",
};

const STATUS = {
  active: { label: "Active", tone: "ok" },
  pending: { label: "Waiting for DNS", tone: "warn" },
  failed: { label: "Not working", tone: "error" },
} as const;

/**
 * The owner's own domain for their forms (ADR 0025): one CNAME, and Cloudflare issues the
 * certificate. Forms then also open at `https://<domain>/<path>`.
 */
export function CustomDomainCard() {
  const uid = useId();
  const [state, setState] = useState<DomainState | null>(null);
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    api.domain().then(setState, () => {
      setState(null);
    });
  }, []);

  const run = async (action: () => Promise<DomainState>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await action());
      setConfirmRemove(false);
    } catch (err) {
      setError(
        (err instanceof ApiError && PROBLEMS[err.code]) || "That didn't work. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!state?.available) return null;
  const domain = state.domain;
  const status = domain && STATUS[domain.status];

  return (
    <section className="card">
      <h2 className="section-title">Custom domain</h2>
      {!domain ? (
        <>
          <p className="helper">
            Show your forms at your own address, such as <code>forms.yourcompany.com/contact</code>.
            Use a subdomain you don&apos;t use for anything else.
          </p>
          <label className="field-label" htmlFor={`${uid}-host`}>
            Domain
          </label>
          <div className="row">
            <input
              id={`${uid}-host`}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="forms.example.com"
              value={hostname}
              maxLength={253}
              onChange={(e) => {
                setHostname(e.target.value);
              }}
            />
            <button
              type="button"
              disabled={busy || hostname.trim() === ""}
              onClick={() => void run(() => api.setDomain(hostname.trim()))}
            >
              Add domain
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="status-line">
            <strong>{domain.hostname}</strong>{" "}
            {status && <span className={`status ${status.tone}`}>{status.label}</span>}
          </p>
          {domain.status !== "active" && (
            <>
              <p className="helper">
                At your DNS provider, add this record. Your forms start working here a few minutes
                after it is in place, with a certificate issued by Cloudflare.
              </p>
              <dl className="dns-record">
                <dt>Type</dt>
                <dd>
                  <code>CNAME</code>
                </dd>
                <dt>Name</dt>
                <dd>
                  <code>{domain.hostname}</code>
                </dd>
                <dt>Target</dt>
                <dd>
                  <code>{state.target}</code>
                </dd>
              </dl>
              <p className="helper">
                If your DNS is on Cloudflare, turn the proxy off for this record (DNS only).
                Unfinished domains are released after 7 days.
              </p>
              {domain.detail && <p className="muted small">Status: {domain.detail}</p>}
            </>
          )}
          {domain.status === "active" && (
            <p className="helper">
              Your published forms open at <code>https://{domain.hostname}/</code> followed by the
              form&apos;s short address, which you set on its Publish tab.
            </p>
          )}
          <div className="row">
            {domain.status !== "active" && (
              <button type="button" disabled={busy} onClick={() => void run(api.domain)}>
                Check again
              </button>
            )}
            {confirmRemove ? (
              <>
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => void run(api.removeDomain)}
                >
                  Remove domain
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setConfirmRemove(false);
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
                  setConfirmRemove(true);
                }}
              >
                Remove…
              </button>
            )}
          </div>
          {confirmRemove && (
            <p className="helper">
              Links on this domain stop working. Form links on freelyforms.link keep working.
            </p>
          )}
        </>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
