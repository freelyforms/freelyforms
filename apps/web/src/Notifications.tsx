import { useEffect, useState } from "react";
import { api, type Notifications } from "./api.js";

/**
 * Email to the owner when responses arrive (ADR 0026): a count and links, never the answers.
 * Hidden when the deployment can't send email.
 */
export function NotificationsCard({ formId }: { formId: string }) {
  const [state, setState] = useState<Notifications | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.notifications(formId).then(setState, () => {
      setState(null);
    });
  }, [formId]);

  if (!state?.available) return null;

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setState(await api.setNotifications(formId, enabled));
    } catch {
      setError("That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2 className="section-title">Email notifications</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={state.enabled}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
        Email me when responses arrive
      </label>
      <p className="helper">
        To <strong>{state.email}</strong>, at most one email every 15 minutes. It says how many
        responses arrived and links to your sheet; the answers stay in the sheet.
      </p>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
