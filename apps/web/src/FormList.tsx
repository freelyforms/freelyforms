import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { api, ApiError, type FormSummary } from "./api.js";
import { Link } from "./App.js";
import { clearPendingTemplate, pendingTemplate, templateName } from "./pendingTemplate.js";
import { navigate } from "./router.js";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function FormList() {
  const [forms, setForms] = useState<FormSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const [template, setTemplate] = useState(pendingTemplate);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const createFromTemplate = async () => {
    if (!template) return;
    setCreating(true);
    try {
      const form = await api.createForm("", template);
      clearPendingTemplate();
      navigate(`/forms/${form.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "unknown_template") {
        clearPendingTemplate();
        setTemplate(null);
        setError("That template doesn't exist (anymore). Start from a blank form instead.");
      } else {
        setError("That template could not be copied. Please try again.");
      }
      setCreating(false);
    }
  };

  /** A form exported with Download JSON (here or elsewhere) becomes a new draft. */
  const importFile = async (file: File) => {
    setError(null);
    if (file.size > 256 * 1024) {
      setError("That file is too large for a form (256 KB at most).");
      return;
    }
    let definition: unknown;
    try {
      definition = JSON.parse(await file.text());
    } catch {
      setError("That file isn't valid JSON. Choose a form saved with Download JSON.");
      return;
    }
    setCreating(true);
    try {
      const form = await api.importForm(definition);
      navigate(`/forms/${form.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_form") {
        const issues = (err.body.issues as { path: string; message: string }[] | undefined) ?? [];
        const listed = issues
          .slice(0, 3)
          .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
          .join("; ");
        setError(`That file isn't a form Freely Forms can read. ${listed}`);
      } else {
        setError("The form could not be imported. Please try again.");
      }
      setCreating(false);
    }
  };

  const importButton = (
    <>
      <button
        type="button"
        className="ghost"
        disabled={creating}
        onClick={() => {
          fileRef.current?.click();
        }}
      >
        Import JSON
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        aria-label="Import a form from a JSON file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importFile(file);
        }}
      />
    </>
  );

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
        {!creatingOpen && forms && forms.length > 0 && (
          <div className="row">
            {importButton}
            {newForm}
          </div>
        )}
      </div>

      {template && (
        <div className="card create">
          <h2 className="section-title">Start from the {templateName(template)} template</h2>
          <p className="helper">
            A copy goes into your account; you can change anything before publishing.
          </p>
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={creating}
              onClick={() => void createFromTemplate()}
            >
              {creating ? "Creating…" : "Create form"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                clearPendingTemplate();
                setTemplate(null);
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

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
          <div className="row">
            {newForm}
            {importButton}
          </div>
        </div>
      )}
      {forms && forms.length > 0 && (
        <ul className="form-list">
          {forms.map((f) => (
            <li key={f.id}>
              <Link to={`/forms/${f.id}`} className="form-card">
                <span className="form-title">{f.title}</span>
                <span className="form-meta">
                  {f.needsAttention ? (
                    <span className="status warn">Delivery needs attention</span>
                  ) : (
                    <span className={`status ${f.status === "published" ? "ok" : "draft"}`}>
                      {f.status === "published" ? "Published" : "Draft"}
                    </span>
                  )}
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
