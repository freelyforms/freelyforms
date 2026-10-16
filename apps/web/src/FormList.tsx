import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { api, type FormSummary } from "./api.js";
import { Link } from "./App.js";
import { navigate } from "./router.js";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function FormList() {
  const [forms, setForms] = useState<FormSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (creatingOpen) titleRef.current?.focus();
  }, [creatingOpen]);

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

  const newForm = (
    <button
      type="button"
      className="primary"
      onClick={() => {
        setCreatingOpen(true);
      }}
    >
      + New form
    </button>
  );

  return (
    <main className="page">
      <div className="page-head">
        <h1>
          Forms
          {forms && forms.length > 0 && <span className="count">{forms.length}</span>}
        </h1>
        {!creatingOpen && forms && forms.length > 0 && newForm}
      </div>

      {creatingOpen && (
        <form className="card create" onSubmit={(e) => void create(e)}>
          <label htmlFor="new-title" className="field-label">
            Form name
          </label>
          <div className="row">
            <input
              id="new-title"
              ref={titleRef}
              placeholder="e.g. Contact us"
              value={title}
              maxLength={200}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
            <button className="primary" type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setCreatingOpen(false);
                setTitle("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {forms === null && !error && <p className="muted">Loading…</p>}
      {forms?.length === 0 && !creatingOpen && (
        <div className="card empty">
          <h2 className="section-title">Create your first form</h2>
          <p className="muted">
            Build it here, share a link or embed it, and every response becomes a row in a Google
            Sheet in your Drive.
          </p>
          {newForm}
        </div>
      )}
      {forms && forms.length > 0 && (
        <ul className="form-list">
          {forms.map((f) => (
            <li key={f.id}>
              <Link to={`/forms/${f.id}`} className="form-card">
                <span className="form-title">{f.title}</span>
                <span className="form-meta">
                  <span className={`status ${f.status === "published" ? "ok" : "draft"}`}>
                    {f.status === "published" ? "Published" : "Draft"}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Edited {dateFormat.format(f.updatedAt)}</span>
                </span>
                <span className="chevron" aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
