import { useEffect, useId, useState } from "react";
import { api, ApiError, type Webhook } from "./api.js";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const URL_PROBLEMS: Record<string, string> = {
  https_required: "Use an address that starts with https://.",
  host_not_allowed: "Use a public web address, not localhost or an IP address.",
  credentials_not_allowed: "Remove the user name and password from the address.",
  invalid_url: "That isn't a web address.",
  too_long: "That address is too long.",
};

/**
 * Also sends each response to the owner's own URL as signed JSON (ADR 0021). The sheet stays the
 * destination of record; a failing webhook never holds it back.
 */
export function WebhookCard({ formId }: { formId: string }) {
  const uid = useId();
  const [webhook, setWebhook] = useState<Webhook | null | undefined>(undefined);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getWebhook(formId).then(
      (r) => {
        setWebhook(r.webhook);
        setUrl(r.webhook?.url ?? "");
      },
      () => {
        setWebhook(null);
      },
    );
  }, [formId]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "invalid_webhook_url"
          ? (URL_PROBLEMS[String(err.body.reason)] ?? "That address can't be used.")
          : "That didn't work. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const r = await api.saveWebhook(formId, url.trim());
      setWebhook(r.webhook);
      if (r.secret) setSecret(r.secret);
      setNote(r.secret ? null : "Saved.");
    });

  if (webhook === undefined) return null;
  const status = webhook?.lastAttemptAt
    ? webhook.failing
      ? `Last delivery failed (${webhook.lastStatus ? `HTTP ${String(webhook.lastStatus)}` : "no answer"}) on ${dateFormat.format(webhook.lastAttemptAt)}.`
      : `Last delivery succeeded on ${dateFormat.format(webhook.lastAttemptAt)}.`
    : webhook
      ? "No responses sent yet."
      : null;

  return (
    <section className="card">
      <h2 className="section-title">Webhook</h2>
      <p className="helper">
        Also send each response to your own system as signed JSON. Your sheet still gets every
        response.
      </p>
      <label className="field-label" htmlFor={`${uid}-url`}>
        Endpoint URL
      </label>
      <div className="row">
        <input
          id={`${uid}-url`}
          type="url"
          inputMode="url"
          placeholder="https://example.com/hooks/forms"
          value={url}
          maxLength={2000}
          onChange={(e) => {
            setUrl(e.target.value);
          }}
        />
        <button
          type="button"
          disabled={busy || url.trim() === "" || url.trim() === webhook?.url}
          onClick={() => void save()}
        >
          {webhook ? "Save" : "Add webhook"}
        </button>
      </div>
      {status && <p className={webhook?.failing ? "alert" : "muted small"}>{status}</p>}
      {secret && (
        <div className="secret" role="status">
          <p>
            <strong>Signing secret</strong> — copy it now; it won't be shown again. Check the{" "}
            <code>Freely-Signature</code> header with it.
          </p>
          <code className="secret-value">{secret}</code>
        </div>
      )}
      {webhook && (
        <div className="row">
          <button
            type="button"
            className="ghost small"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await api.testWebhook(formId);
                setNote(
                  r.ok
                    ? `Test event delivered (HTTP ${String(r.status)}).`
                    : r.status
                      ? `Your endpoint answered HTTP ${String(r.status)}.`
                      : "Your endpoint didn't answer within 10 seconds.",
                );
              })
            }
          >
            Send a test event
          </button>
          <button
            type="button"
            className="ghost small"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setSecret((await api.rotateWebhookSecret(formId)).secret);
              })
            }
          >
            New signing secret
          </button>
          <button
            type="button"
            className="ghost small"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api.deleteWebhook(formId);
                setWebhook(null);
                setUrl("");
                setSecret(null);
              })
            }
          >
            Remove webhook
          </button>
        </div>
      )}
      {note && (
        <p className="muted small" role="status">
          {note}
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
