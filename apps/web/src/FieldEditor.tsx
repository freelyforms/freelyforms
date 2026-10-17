import type { Field } from "@freelyforms/form-schema";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FIELD_TYPE_LABELS, hasOptions } from "./draft.js";
import { useDismiss } from "./useDismiss.js";

interface Props {
  field: Field;
  index: number;
  count: number;
  issues: string[];
  autoFocus: boolean;
  onChange: (patch: Record<string, unknown>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onAddOption: () => void;
  onUpdateOption: (optionId: string, label: string) => void;
  onRemoveOption: (optionId: string) => void;
  onMoveOption: (optionId: string, delta: number) => void;
  onHandlePointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}

/** "" → undefined (removes the property); otherwise a number, or undefined if not numeric. */
const toNumber = (value: string): number | undefined => {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};
const toInt = (value: string) => {
  const n = toNumber(value);
  return n === undefined ? undefined : Math.max(0, Math.trunc(n));
};

export function FieldEditor(props: Props) {
  const { field } = props;
  const uid = useId();
  const labelRef = useRef<HTMLInputElement>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setConfirmRemove(false);
  }, []);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useDismiss(menuRef, menuOpen, closeMenu, menuButtonRef);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (props.autoFocus) {
      labelRef.current?.focus();
      labelRef.current?.select();
    }
  }, [props.autoFocus]);

  const id = (name: string) => `${uid}-${name}`;
  const num = (name: string, label: string, value: number | undefined, int = false) => (
    <div className="mini">
      <label htmlFor={id(name)}>{label}</label>
      <input
        id={id(name)}
        type="number"
        inputMode={int ? "numeric" : "decimal"}
        step={int ? 1 : "any"}
        min={int ? 0 : undefined}
        value={value ?? ""}
        onChange={(e) => {
          props.onChange({ [name]: int ? toInt(e.target.value) : toNumber(e.target.value) });
        }}
      />
    </div>
  );

  return (
    <article className={props.issues.length ? "card field-card has-issues" : "card field-card"}>
      <div className="field-head">
        <button
          type="button"
          className="handle"
          data-handle={field.id}
          aria-label={`Reorder ${field.label}`}
          aria-describedby={id("handle-hint")}
          title="Drag to reorder (Alt+↑/↓ with the keyboard)"
          onPointerDown={props.onHandlePointerDown}
          onKeyDown={(e) => {
            if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
              e.preventDefault();
              props.onMove(e.key === "ArrowUp" ? -1 : 1);
            }
          }}
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <span id={id("handle-hint")} className="visually-hidden">
          Drag to reorder. Press Alt and the up or down arrow to move this field.
        </span>
        <span className="type-tag">{FIELD_TYPE_LABELS[field.type]}</span>
        <span className="spacer" />
        <button
          type="button"
          className="icon"
          aria-label={`Move ${field.label} up`}
          disabled={props.index === 0}
          onClick={() => {
            props.onMove(-1);
          }}
        >
          ↑
        </button>
        <button
          type="button"
          className="icon"
          aria-label={`Move ${field.label} down`}
          disabled={props.index === props.count - 1}
          onClick={() => {
            props.onMove(1);
          }}
        >
          ↓
        </button>
        <div className="menu" ref={menuRef}>
          <button
            type="button"
            className="icon"
            ref={menuButtonRef}
            aria-expanded={menuOpen}
            aria-label={`More actions for ${field.label}`}
            onClick={() => {
              setMenuOpen((v) => !v);
              setConfirmRemove(false);
            }}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="menu-list">
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  props.onDuplicate();
                }}
              >
                Duplicate
              </button>
              {confirmRemove ? (
                <button type="button" className="menu-item danger-text" onClick={props.onRemove}>
                  Click again to delete
                </button>
              ) : (
                <button
                  type="button"
                  className="menu-item danger-text"
                  onClick={() => {
                    setConfirmRemove(true);
                  }}
                >
                  Delete field
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <label className="field-label" htmlFor={id("label")}>
        {field.type === "consent"
          ? "Statement the respondent agrees to"
          : field.type === "hidden"
            ? "Column name"
            : "Question"}
      </label>
      <input
        ref={labelRef}
        id={id("label")}
        value={field.label}
        maxLength={500}
        onChange={(e) => {
          props.onChange({ label: e.target.value });
        }}
      />

      {hasOptions(field) && (
        <fieldset className="options">
          <legend className="field-label">Options</legend>
          <ol>
            {field.options.map((option, i) => (
              <li key={option.id} className="option-row">
                <label className="visually-hidden" htmlFor={id(option.id)}>
                  Option {i + 1}
                </label>
                <input
                  id={id(option.id)}
                  value={option.label}
                  maxLength={200}
                  onChange={(e) => {
                    props.onUpdateOption(option.id, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && i === field.options.length - 1) {
                      e.preventDefault();
                      props.onAddOption();
                    }
                  }}
                />
                <button
                  type="button"
                  className="icon"
                  aria-label={`Move option ${option.label} up`}
                  disabled={i === 0}
                  onClick={() => {
                    props.onMoveOption(option.id, -1);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon"
                  aria-label={`Remove option ${option.label}`}
                  disabled={field.options.length <= 1}
                  onClick={() => {
                    props.onRemoveOption(option.id);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="ghost small" onClick={props.onAddOption}>
            + Add option
          </button>
        </fieldset>
      )}

      {field.type === "hidden" ? (
        <div className="more">
          <p className="muted small">
            Not shown to respondents. Filled from <code>?{field.param ?? field.id}=…</code> in the
            form link or in the address of the page it's embedded on. Respondents can change it.
          </p>
          <div className="minis">
            <div className="mini">
              <label htmlFor={id("param")}>URL parameter</label>
              <input
                id={id("param")}
                value={field.param ?? ""}
                placeholder={field.id}
                maxLength={64}
                onChange={(e) => {
                  props.onChange({ param: e.target.value.trim() || undefined });
                }}
              />
            </div>
            <div className="mini">
              <label htmlFor={id("default")}>Value when the link has none</label>
              <input
                id={id("default")}
                value={field.defaultValue ?? ""}
                maxLength={1000}
                onChange={(e) => {
                  props.onChange({ defaultValue: e.target.value || undefined });
                }}
              />
            </div>
          </div>
          <p className="muted small">
            Field ID <code>{field.id}</code>
          </p>
        </div>
      ) : (
        <>
          <div className="field-row">
            <label className="check">
              <input
                type="checkbox"
                checked={field.required === true}
                onChange={(e) => {
                  props.onChange({ required: e.target.checked || undefined });
                }}
              />
              Required
            </label>
            <button
              type="button"
              className="disclosure"
              aria-expanded={showMore}
              onClick={() => {
                setShowMore((v) => !v);
              }}
            >
              Field settings {showMore ? "▴" : "▾"}
            </button>
          </div>

          {showMore && (
            <div className="more">
              <label className="field-label" htmlFor={id("description")}>
                Help text <span className="muted">(optional)</span>
              </label>
              <input
                id={id("description")}
                value={field.description ?? ""}
                maxLength={2000}
                onChange={(e) => {
                  props.onChange({ description: e.target.value || undefined });
                }}
              />
              {"placeholder" in field ||
              ["text", "textarea", "email", "phone", "number"].includes(field.type) ? (
                <>
                  <label className="field-label" htmlFor={id("placeholder")}>
                    Placeholder <span className="muted">(optional)</span>
                  </label>
                  <input
                    id={id("placeholder")}
                    value={"placeholder" in field ? (field.placeholder ?? "") : ""}
                    maxLength={200}
                    onChange={(e) => {
                      props.onChange({ placeholder: e.target.value || undefined });
                    }}
                  />
                </>
              ) : null}
              <div className="minis">
                {(field.type === "text" || field.type === "textarea") && (
                  <>
                    {num("minLength", "Min characters", field.minLength, true)}
                    {num("maxLength", "Max characters", field.maxLength, true)}
                  </>
                )}
                {field.type === "number" && (
                  <>
                    {num("min", "Minimum", field.min)}
                    {num("max", "Maximum", field.max)}
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={field.integer === true}
                        onChange={(e) => {
                          props.onChange({ integer: e.target.checked || undefined });
                        }}
                      />
                      Whole numbers only
                    </label>
                  </>
                )}
                {field.type === "date" &&
                  (["min", "max"] as const).map((key) => (
                    <div className="mini" key={key}>
                      <label htmlFor={id(key)}>{key === "min" ? "Earliest" : "Latest"}</label>
                      <input
                        id={id(key)}
                        type="date"
                        value={field[key] ?? ""}
                        onChange={(e) => {
                          props.onChange({ [key]: e.target.value || undefined });
                        }}
                      />
                    </div>
                  ))}
                {(field.type === "checkboxes" || field.type === "multiselect") && (
                  <>
                    {num("minSelected", "Choose at least", field.minSelected, true)}
                    {num("maxSelected", "Choose at most", field.maxSelected, true)}
                  </>
                )}
              </div>
              <p className="muted small">
                Field ID <code>{field.id}</code> — the column in your sheet is matched by this ID,
                so renaming the question never breaks it.
              </p>
            </div>
          )}
        </>
      )}

      {props.issues.map((m) => (
        <p key={m} className="issue" role="alert">
          {m}
        </p>
      ))}
    </article>
  );
}
