import { parseForm, type Form } from "@freelyforms/form-schema";
import { FIELD_TYPES, MAX_FIELDS, type FieldType } from "@freelyforms/form-schema/limits";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, ApiError, SIGN_IN_URL, type FormView, type SchemaIssue } from "./api.js";
import { Link } from "./App.js";
import { DesignPanel } from "./DesignPanel.js";
import {
  addField,
  addUtmFields,
  addOption,
  duplicateField,
  FIELD_TYPE_LABELS,
  issuesByField,
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
import { useSortable } from "./useSortable.js";
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
  const [announcement, setAnnouncement] = useState("");
  /** A field whose handle should get focus back after the next render. */
  const refocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!refocus.current) return;
    document.querySelector<HTMLElement>(`[data-handle="${refocus.current}"]`)?.focus();
    refocus.current = null;
  });
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

  /** Moves a field (drag and drop, buttons or Alt+arrows) and announces the new position. */
  const moveTo = useCallback(
    (fieldId: string, toIndex: number) => {
      const current = formRef.current;
      if (!current) return;
      const to = Math.max(0, Math.min(current.fields.length - 1, toIndex));
      const next = moveFieldTo(current, fieldId, to);
      if (next === current) return;
      edit(next);
      // Moving a field down re-inserts its element, which drops focus; put it back on the handle.
      if (document.activeElement?.closest(`[data-field="${fieldId}"]`)) refocus.current = fieldId;
      const label = current.fields.find((f) => f.id === fieldId)?.label ?? "Field";
      setAnnouncement(
        `Moved "${label}" to position ${String(to + 1)} of ${String(current.fields.length)}`,
      );
    },
    [edit],
  );
  const { drag, itemRef, onHandlePointerDown } = useSortable(
    form?.fields.map((f) => f.id) ?? [],
    moveTo,
  );

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
              <div className="card details">
                <h2 className="section-title">Form details</h2>
                <label className="field-label" htmlFor="form-title">
                  Title
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
                  rows={1}
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
              <ol className={drag ? "field-list sorting" : "field-list"}>
                {form.fields.map((field, index) => (
                  <li
                    key={field.id}
                    data-field={field.id}
                    ref={itemRef(field.id)}
                    className={
                      [
                        drag?.id === field.id ? "dragging" : "",
                        drag && drag.insertAt === index ? "drop-before" : "",
                        drag &&
                        drag.insertAt === form.fields.length &&
                        index === form.fields.length - 1
                          ? "drop-after"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
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
                        moveTo(field.id, index + delta);
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
                      onHandlePointerDown={onHandlePointerDown(field.id)}
                    />
                  </li>
                ))}
              </ol>
              {drag && (
                <div
                  className="drag-ghost"
                  style={{ left: drag.x + 12, top: drag.y + 12 }}
                  aria-hidden="true"
                >
                  {(() => {
                    const f = form.fields.find((x) => x.id === drag.id);
                    return f ? (
                      <>
                        <span className="type-tag">{FIELD_TYPE_LABELS[f.type]}</span>
                        <span>{f.label}</span>
                      </>
                    ) : null;
                  })()}
                </div>
              )}
              <p className="visually-hidden" aria-live="polite">
                {announcement}
              </p>

              <div className="card add-field">
                <h2 className="section-title">Add a field</h2>
                {form.fields.length >= MAX_FIELDS ? (
                  <p className="muted">A form can have up to {MAX_FIELDS} fields.</p>
                ) : (
                  <div className="palette">
                    {FIELD_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        className="palette-item"
                        onClick={() => {
                          add(type);
                        }}
                      >
                        {FIELD_TYPE_LABELS[type]}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="palette-item"
                      title="Hidden fields for utm_source, utm_medium, utm_campaign, utm_term and utm_content"
                      onClick={() => {
                        const result = addUtmFields(form);
                        if (result.added) edit(result.form);
                        setAnnouncement(
                          result.added
                            ? `Added ${String(result.added)} hidden UTM fields at the end of the form.`
                            : "This form already records all UTM parameters.",
                        );
                      }}
                    >
                      UTM tracking
                    </button>
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
          <div className="preview-head">
            <span className="section-title">Preview</span>
            <span className="muted small">Submissions are disabled</span>
          </div>
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
    saved: "Saved",
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
