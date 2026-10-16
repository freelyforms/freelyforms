import { parseForm, type Form } from "@freelyforms/form-schema";
import { FIELD_TYPES, MAX_FIELDS, type FieldType } from "@freelyforms/form-schema/limits";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, SIGN_IN_URL, type FormView, type SchemaIssue } from "./api.js";
import { Link } from "./App.js";
import { DesignPanel } from "./DesignPanel.js";
import {
  addField,
  addOption,
  duplicateField,
  FIELD_TYPE_LABELS,
  issuesByField,
  moveField,
  moveFieldTo,
  moveOption,
  removeField,
  removeOption,
  updateField,
  updateMeta,
  updateOption,
} from "./draft.js";
import { FieldEditor } from "./FieldEditor.js";
import { navigate, setLeaveGuard } from "./router.js";
import { SharePanel } from "./SharePanel.js";

type SaveState =
  | { state: "saved" | "dirty" | "saving" | "error" | "signedOut" }
  | { state: "invalid"; issues: SchemaIssue[] };

/** Outcome of one save: `stale` means the draft changed while it was being saved. */
export type FlushResult = "saved" | "stale" | "invalid" | "error" | "signedOut";

type Tab = "build" | "design" | "share";

const AUTOSAVE_MS = 700;

export function Editor({ id }: { id: string }) {
  const [view, setView] = useState<FormView | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ state: "saved" });
  const [tab, setTab] = useState<Tab>("build");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const formRef = useRef<Form | null>(null);
  /** Edits made so far, and the edit count the server has. Unsaved work = editSeq > savedSeq. */
  const editSeq = useRef(0);
  const savedSeq = useRef(0);
  /** The save in progress; saves never overlap, so an older draft cannot land last. */
  const inFlight = useRef<Promise<FlushResult> | null>(null);
  const gone = useRef(false);

  useEffect(() => {
    api.getForm(id).then(
      (v) => {
        setView(v);
        const parsed = parseForm(v.draft);
        const draft = parsed.success ? parsed.form : (v.draft as Form);
        formRef.current = draft;
        setForm(draft);
        if (!parsed.success) setSave({ state: "invalid", issues: parsed.issues });
      },
      (err: unknown) => {
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "This form does not exist or was deleted."
            : "The form could not be loaded. Please reload the page.",
        );
      },
    );
  }, [id]);

  const edit = useCallback((next: Form) => {
    editSeq.current += 1;
    formRef.current = next;
    setForm(next);
    setSave({ state: "dirty" });
  }, []);

  /** Saves the current draft once, after any save already in progress. */
  const flush = useCallback(async (): Promise<FlushResult> => {
    while (inFlight.current) await inFlight.current;
    const run = async (): Promise<FlushResult> => {
      const current = formRef.current;
      if (!current) return "error";
      const seq = editSeq.current;
      if (seq === savedSeq.current) return "saved";
      const parsed = parseForm(current);
      if (!parsed.success) {
        setSave({ state: "invalid", issues: parsed.issues });
        return "invalid";
      }
      setSave({ state: "saving" });
      try {
        const saved = await api.saveDraft(id, parsed.form);
        savedSeq.current = seq;
        if (gone.current) return "saved";
        setView(saved);
        setPreviewVersion((n) => n + 1);
        const latest = seq === editSeq.current;
        setSave({ state: latest ? "saved" : "dirty" });
        return latest ? "saved" : "stale";
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setSave({ state: "signedOut" });
          return "signedOut";
        }
        if (err instanceof ApiError && err.code === "invalid_form") {
          setSave({
            state: "invalid",
            issues: (err.body.issues as SchemaIssue[] | undefined) ?? [],
          });
          return "invalid";
        }
        setSave({ state: "error" });
        return "error";
      }
    };
    const promise = run();
    inFlight.current = promise;
    try {
      return await promise;
    } finally {
      inFlight.current = null;
    }
  }, [id]);

  // Debounced autosave after each edit.
  useEffect(() => {
    if (save.state !== "dirty") return;
    const timer = setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [form, save.state, flush]);

  // Leaving the editor inside the app: save valid edits on the way out, and ask before dropping
  // edits that cannot be saved. Reloads and closing the tab are covered by beforeunload.
  useEffect(() => {
    setLeaveGuard(() => {
      if (editSeq.current === savedSeq.current) return true;
      const valid = formRef.current !== null && parseForm(formRef.current).success;
      return valid || window.confirm("Some changes cannot be saved yet. Leave and lose them?");
    });
    return () => {
      setLeaveGuard(null);
      gone.current = true;
      if (editSeq.current !== savedSeq.current) void flush();
    };
  }, [flush]);

  useEffect(() => {
    if (save.state === "saved") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [save.state]);

  /** After the form is deleted there is nothing left to save. */
  const onDeleted = () => {
    savedSeq.current = editSeq.current;
    setSave({ state: "saved" });
    navigate("/");
  };

  if (loadError) {
    return (
      <main className="page">
        <p className="alert" role="alert">
          {loadError}
        </p>
        <Link to="/">Back to your forms</Link>
      </main>
    );
  }
  if (!form || !view) return <p className="center muted">Loading…</p>;

  const issues =
    save.state === "invalid" ? issuesByField(form, save.issues) : new Map<string, string[]>();
  const add = (type: FieldType) => {
    const result = addField(form, type);
    edit(result.form);
    setFocusId(result.id);
  };

  return (
    <div className="editor">
      <div className="editor-bar">
        <Link to="/" className="back">
          ← Forms
        </Link>
        <h1 className="editor-title">{form.title}</h1>
        <SaveStatus save={save} onRetry={() => void flush()} />
        <div className="tabs" role="tablist" aria-label="Editor sections">
          {(["build", "design", "share"] as const).map((t) => (
            <button
              key={t}
              id={`tab-${t}`}
              type="button"
              role="tab"
              className={tab === t ? "tab active" : "tab"}
              aria-selected={tab === t}
              aria-controls="editor-panel"
              onClick={() => {
                setTab(t);
              }}
            >
              {{ build: "Fields", design: "Design", share: "Publish" }[t]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ghost preview-toggle"
          aria-pressed={showPreview}
          onClick={() => {
            setShowPreview((v) => !v);
          }}
        >
          {showPreview ? "Hide preview" : "Preview"}
        </button>
      </div>

      <div className={showPreview ? "editor-body with-preview" : "editor-body"}>
        <section
          id="editor-panel"
          className="editor-pane"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
        >
          {issues.get("")?.length ? (
            <div className="card has-issues" role="alert">
              {issues.get("")?.map((m) => (
                <p key={m} className="issue">
                  {m}
                </p>
              ))}
            </div>
          ) : null}
          {tab === "build" && (
            <>
              <div className="card">
                <label className="field-label" htmlFor="form-title">
                  Form title
                </label>
                <input
                  id="form-title"
                  className="title-input"
                  value={form.title}
                  maxLength={200}
                  onChange={(e) => {
                    edit(updateMeta(form, { title: e.target.value }));
                  }}
                />
                <label className="field-label" htmlFor="form-description">
                  Description <span className="muted">(optional)</span>
                </label>
                <textarea
                  id="form-description"
                  rows={2}
                  value={form.description ?? ""}
                  maxLength={5000}
                  onChange={(e) => {
                    edit(updateMeta(form, { description: e.target.value }));
                  }}
                />
              </div>

              {form.fields.length === 0 && (
                <p className="empty muted">Add your first field below.</p>
              )}
              <ol className="field-list">
                {form.fields.map((field, index) => (
                  <li
                    key={field.id}
                    className={dragId === field.id ? "dragging" : undefined}
                    onDragOver={(e) => {
                      if (dragId) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId) edit(moveFieldTo(form, dragId, index));
                      setDragId(null);
                    }}
                  >
                    <FieldEditor
                      field={field}
                      index={index}
                      count={form.fields.length}
                      issues={issues.get(field.id) ?? []}
                      autoFocus={focusId === field.id}
                      onChange={(patch) => {
                        edit(updateField(form, field.id, patch));
                      }}
                      onMove={(delta) => {
                        edit(moveField(form, field.id, delta));
                      }}
                      onRemove={() => {
                        edit(removeField(form, field.id));
                      }}
                      onDuplicate={() => {
                        const result = duplicateField(form, field.id);
                        edit(result.form);
                        setFocusId(result.id);
                      }}
                      onAddOption={() => {
                        edit(addOption(form, field.id));
                      }}
                      onUpdateOption={(optionId, label) => {
                        edit(updateOption(form, field.id, optionId, label));
                      }}
                      onRemoveOption={(optionId) => {
                        edit(removeOption(form, field.id, optionId));
                      }}
                      onMoveOption={(optionId, delta) => {
                        edit(moveOption(form, field.id, optionId, delta));
                      }}
                      onDragStart={() => {
                        setDragId(field.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                      }}
                    />
                  </li>
                ))}
              </ol>

              <div className="card add-field">
                <h2 className="small-heading">Add a field</h2>
                {form.fields.length >= MAX_FIELDS ? (
                  <p className="muted">A form can have up to {MAX_FIELDS} fields.</p>
                ) : (
                  <div className="palette">
                    {FIELD_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        className="chip"
                        onClick={() => {
                          add(type);
                        }}
                      >
                        + {FIELD_TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {tab === "design" && <DesignPanel form={form} onChange={edit} />}
          {tab === "share" && (
            <SharePanel
              view={view}
              fieldCount={form.fields.length}
              form={form}
              saveState={save.state}
              flush={flush}
              onPublished={setView}
              onDeleted={onDeleted}
            />
          )}
        </section>

        <section className="preview-pane" aria-label="Preview">
          <iframe
            title="Preview of your form"
            loading="lazy"
            src={`/forms/${id}/preview?v=${String(previewVersion)}`}
          />
        </section>
      </div>
    </div>
  );
}

function SaveStatus({ save, onRetry }: { save: SaveState; onRetry: () => void }) {
  const text = {
    saved: "All changes saved",
    dirty: "Editing…",
    saving: "Saving…",
    error: "Not saved",
    invalid: "Not saved — fix the highlighted problems",
    signedOut: "Not saved — your session ended",
  }[save.state];
  return (
    <span className={`save-status ${save.state}`} role="status" aria-live="polite">
      {text}
      {save.state === "error" && (
        <button type="button" className="link" onClick={onRetry}>
          Retry
        </button>
      )}
      {save.state === "signedOut" && (
        <a href={SIGN_IN_URL} target="_blank" rel="noopener">
          Sign in again (opens a new tab), then retry
        </a>
      )}
      {save.state === "signedOut" && (
        <button type="button" className="link" onClick={onRetry}>
          Retry
        </button>
      )}
    </span>
  );
}
