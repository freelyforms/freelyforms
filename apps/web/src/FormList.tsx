import { useEffect, useState, type SyntheticEvent } from "react";
import { api, type FormSummary } from "./api.js";
import { Link } from "./App.js";
import { navigate } from "./router.js";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function FormList() {
  const [forms, setForms] = useState<FormSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listForms().then(
      (r) => {
        setForms(r.forms);
      },
      () => {
        setError("Your forms could not be loaded. Please reload the page.");
      },
    );
  }, []);

  const create = async (e: SyntheticEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const form = await api.createForm(title.trim() || "Untitled form");
      navigate(`/forms/${form.id}`);
    } catch {
      setError("The form could not be created. Please try again.");
      setCreating(false);
    }
  };

  return (
    <main className="page">
      <h1>Your forms</h1>
      <form className="create" onSubmit={(e) => void create(e)}>
        <label htmlFor="new-title" className="visually-hidden">
          New form title
        </label>
        <input
          id="new-title"
          placeholder="New form title, e.g. Contact us"
          value={title}
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
        <button className="primary" type="submit" disabled={creating}>
          {creating ? "Creating…" : "Create form"}
        </button>
      </form>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {forms === null && !error && <p className="muted">Loading…</p>}
      {forms?.length === 0 && (
        <div className="empty">
          <p>No forms yet.</p>
          <p className="muted">
            Create one above. Responses will go to a Google Sheet in your Drive when you publish it.
          </p>
        </div>
      )}
      {forms && forms.length > 0 && (
        <ul className="form-list">
          {forms.map((f) => (
            <li key={f.id}>
              <Link to={`/forms/${f.id}`} className="form-card">
                <span className="form-title">{f.title}</span>
                <span className={`badge ${f.status}`}>
                  {f.status === "published" ? "Published" : "Draft"}
                </span>
                <span className="muted small">Edited {dateFormat.format(f.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
