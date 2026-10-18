import type { AnswerFormat, Field } from "@freelyforms/form-schema";
import { isAnswerField, SUMMABLE_TYPES } from "@freelyforms/form-schema/limits";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Conditions } from "./Conditions.js";
import { FIELD_TYPE_LABELS, hasOptions, matrixItem } from "./draft.js";
import { useDismiss } from "./useDismiss.js";

interface Props {
  field: Field;
  /** Fields above this one, which its conditions may test. */
  earlier: readonly Field[];
  /** True when a calculation adds this choice field up, so its options take scores (ADR 0022). */
  scored: boolean;
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
            : field.type === "page"
              ? "Page title"
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
                {props.scored && (
                  <input
                    className="score"
                    type="number"
                    step="any"
                    aria-label={`Score for ${option.label}`}
                    placeholder="0"
                    value={option.score ?? ""}
                    onChange={(e) => {
                      const n = e.target.value === "" ? undefined : Number(e.target.value);
                      props.onChange({
                        options: field.options.map((o) =>
                          o.id === option.id
                            ? Object.fromEntries(
                                Object.entries({ ...o, score: n }).filter(
                                  ([, v]) => v !== undefined && !Number.isNaN(v),
                                ),
                              )
                            : o,
                        ),
                      });
                    }}
                  />
                )}
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

      {field.type === "matrix" &&
        (["rows", "columns"] as const).map((kind) => (
          <ItemList
            key={kind}
            legend={kind === "rows" ? "Rows (questions)" : "Columns (answers)"}
            items={field[kind]}
            min={kind === "rows" ? 1 : 2}
            max={kind === "rows" ? 20 : 10}
            scored={kind === "columns" && props.scored}
            onChange={(items) => {
              props.onChange({ [kind]: items });
            }}
            newItem={(n) => matrixItem(kind, `${kind === "rows" ? "Row" : "Column"} ${String(n)}`)}
          />
        ))}

      {field.type === "calculation" ? (
        <div className="more">
          <fieldset className="options">
            <legend className="field-label">Add up</legend>
            {props.earlier.filter((f) => SUMMABLE_TYPES.includes(f.type)).length === 0 && (
              <p className="muted small">
                Add a number, rating, scale or choice question above this one first.
              </p>
            )}
            {props.earlier
              .filter((f) => SUMMABLE_TYPES.includes(f.type))
              .map((f) => (
                <label key={f.id} className="check">
                  <input
                    type="checkbox"
                    checked={field.sum.includes(f.id)}
                    onChange={(e) => {
                      props.onChange({
                        sum: e.target.checked
                          ? props.earlier
                              .filter((x) => x.id === f.id || field.sum.includes(x.id))
                              .map((x) => x.id)
                          : field.sum.filter((x) => x !== f.id),
                      });
                    }}
                  />
                  {f.label}
                </label>
              ))}
          </fieldset>
          <label className="check">
            <input
              type="checkbox"
              checked={field.show === true}
              onChange={(e) => {
                props.onChange({ show: e.target.checked || undefined });
              }}
            />
            Show the result to respondents
          </label>
          <p className="muted small">
            Numbers, ratings and scales add their value; choices add the score of each chosen
            option. The result is computed when the response arrives and goes to its own column.
          </p>
        </div>
      ) : field.type === "page" ? (
        <div className="more">
          <label className="field-label" htmlFor={id("description")}>
            Text under the title <span className="muted">(optional)</span>
          </label>
          <input
            id={id("description")}
            value={field.description ?? ""}
            maxLength={2000}
            onChange={(e) => {
              props.onChange({ description: e.target.value || undefined });
            }}
          />
          <p className="muted small">
            Questions below this start a new page. Respondents see one page at a time, with Back and
            Next.
          </p>
        </div>
      ) : field.type === "hidden" ? (
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
                  // Always required replaces "required only if" (ADR 0019).
                  props.onChange({
                    required: e.target.checked || undefined,
                    ...(e.target.checked ? { requiredIf: undefined } : {}),
                  });
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
                {field.type === "file" && (
                  <>
                    <div className="mini">
                      <label htmlFor={id("accept")}>Accept</label>
                      <select
                        id={id("accept")}
                        value={field.accept ?? "any"}
                        onChange={(e) => {
                          const accept = e.target.value;
                          props.onChange({
                            accept:
                              accept === "images" || accept === "documents" ? accept : undefined,
                          });
                        }}
                      >
                        <option value="any">Any file</option>
                        <option value="images">Images</option>
                        <option value="documents">Documents (PDF, Office, text)</option>
                      </select>
                    </div>
                    {num("maxSizeMb", "Max size per file, MB (1–25)", field.maxSizeMb, true)}
                    {num("maxFiles", "Max files (1–5)", field.maxFiles, true)}
                  </>
                )}
                {field.type === "rating" && num("max", "Number of stars (3–10)", field.max, true)}
                {field.type === "scale" && (
                  <>
                    <div className="mini">
                      <label htmlFor={id("scale-min")}>From</label>
                      <select
                        id={id("scale-min")}
                        value={field.min ?? 1}
                        onChange={(e) => {
                          props.onChange({ min: e.target.value === "0" ? 0 : undefined });
                        }}
                      >
                        <option value={0}>0</option>
                        <option value={1}>1</option>
                      </select>
                    </div>
                    <div className="mini">
                      <label htmlFor={id("scale-max")}>To</label>
                      <select
                        id={id("scale-max")}
                        value={field.max ?? 5}
                        onChange={(e) => {
                          const max = Number(e.target.value);
                          props.onChange({ max: max === 5 ? undefined : max });
                        }}
                      >
                        {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    {(["minLabel", "maxLabel"] as const).map((key) => (
                      <div className="mini" key={key}>
                        <label htmlFor={id(key)}>
                          {key === "minLabel" ? "Label at the start" : "Label at the end"}
                        </label>
                        <input
                          id={id(key)}
                          value={field[key] ?? ""}
                          maxLength={60}
                          placeholder={key === "minLabel" ? "Not likely" : "Very likely"}
                          onChange={(e) => {
                            props.onChange({ [key]: e.target.value || undefined });
                          }}
                        />
                      </div>
                    ))}
                  </>
                )}
                {(field.type === "checkboxes" || field.type === "multiselect") && (
                  <>
                    {num("minSelected", "Choose at least", field.minSelected, true)}
                    {num("maxSelected", "Choose at most", field.maxSelected, true)}
                  </>
                )}
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={field.width === "half"}
                  onChange={(e) => {
                    props.onChange({ width: e.target.checked ? "half" : undefined });
                  }}
                />
                Half width (next to another half-width question on wide screens)
              </label>
              {field.type === "text" && (
                <AnswerFormatEditor
                  id={id}
                  value={field.match}
                  onChange={(match) => {
                    props.onChange({ match });
                  }}
                />
              )}
              <p className="muted small">
                Field ID <code>{field.id}</code> — the column in your sheet is matched by this ID,
                so renaming the question never breaks it.
              </p>
            </div>
          )}
        </>
      )}

      <div className="condition-toggle">
        <Conditions
          legend={`Show this ${field.type === "page" ? "page" : "question"} only if`}
          addLabel="+ Show only if…"
          showIf={field.showIf}
          earlier={props.earlier.filter(isAnswerField)}
          onChange={(showIf) => {
            props.onChange({ showIf });
          }}
        />
      </div>
      {field.type !== "page" &&
        field.type !== "hidden" &&
        field.type !== "calculation" &&
        field.required !== true && (
          <div className="condition-toggle">
            <Conditions
              legend="Require an answer only if"
              addLabel="+ Required only if…"
              showIf={field.requiredIf}
              earlier={props.earlier.filter(isAnswerField)}
              onChange={(requiredIf) => {
                props.onChange({ requiredIf });
              }}
            />
          </div>
        )}

      {props.issues.map((m) => (
        <p key={m} className="issue" role="alert">
          {m}
        </p>
      ))}
    </article>
  );
}

const FORMAT_KINDS: [AnswerFormat["kind"] | "", string][] = [
  ["", "Any text"],
  ["digits", "Digits only"],
  ["letters", "Letters only"],
  ["alphanumeric", "Letters and digits"],
  ["url", "Web address"],
  ["mask", "Custom pattern…"],
];

/** The shape a short answer must have (ADR 0020): a preset or a mask such as AA-9999. */
function AnswerFormatEditor({
  id,
  value,
  onChange,
}: {
  id: (name: string) => string;
  value: AnswerFormat | undefined;
  onChange: (value: AnswerFormat | undefined) => void;
}) {
  const kind = value?.kind ?? "";
  const set = (patch: Partial<AnswerFormat>) => {
    if (!value) return;
    const next = { ...value, ...patch };
    onChange(
      Object.fromEntries(
        Object.entries(next).filter(([, v]) => v !== undefined && v !== ""),
      ) as AnswerFormat,
    );
  };
  return (
    <div className="answer-format">
      <label className="field-label" htmlFor={id("format")}>
        Answer format
      </label>
      <select
        id={id("format")}
        value={kind}
        onChange={(e) => {
          const next = e.target.value as AnswerFormat["kind"] | "";
          if (next === "") onChange(undefined);
          else
            onChange({
              kind: next,
              ...(next === "mask" ? { mask: value?.mask ?? "AA-9999" } : {}),
              ...(value?.message ? { message: value.message } : {}),
            });
        }}
      >
        {FORMAT_KINDS.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      {kind === "mask" && (
        <>
          <label className="field-label" htmlFor={id("mask")}>
            Pattern
          </label>
          <input
            id={id("mask")}
            value={value?.mask ?? ""}
            maxLength={100}
            aria-describedby={id("mask-hint")}
            onChange={(e) => {
              set({ mask: e.target.value });
            }}
          />
          <p className="muted small" id={id("mask-hint")}>
            <code>9</code> is a digit, <code>A</code> a letter, <code>*</code> a letter or digit;
            other characters must match as written. Example: <code>AA-9999</code> accepts AB-1234.
          </p>
        </>
      )}
      {kind !== "" && (
        <>
          <label className="field-label" htmlFor={id("format-message")}>
            Error message <span className="muted">(optional)</span>
          </label>
          <input
            id={id("format-message")}
            value={value?.message ?? ""}
            maxLength={200}
            placeholder="Shown when the answer doesn't fit"
            onChange={(e) => {
              set({ message: e.target.value });
            }}
          />
        </>
      )}
    </div>
  );
}

interface Item {
  id: string;
  label: string;
  score?: number;
}

/** Rows or columns of a matrix (ADR 0023): labels, order and, for scored columns, points. */
function ItemList<T extends Item>({
  legend,
  items,
  min,
  max,
  scored,
  onChange,
  newItem,
}: {
  legend: string;
  items: readonly T[];
  min: number;
  max: number;
  scored: boolean;
  onChange: (items: T[]) => void;
  newItem: (n: number) => T;
}) {
  const uid = useId();
  const update = (id: string, patch: { label?: string; score?: number | undefined }) => {
    onChange(
      items.map((it) =>
        it.id === id
          ? (Object.fromEntries(
              Object.entries({ ...it, ...patch }).filter(
                ([, v]) => v !== undefined && !(typeof v === "number" && Number.isNaN(v)),
              ),
            ) as T)
          : it,
      ),
    );
  };
  return (
    <fieldset className="options">
      <legend className="field-label">{legend}</legend>
      <ol>
        {items.map((item, i) => (
          <li key={item.id} className="option-row">
            <label className="visually-hidden" htmlFor={`${uid}-${item.id}`}>
              {legend} {i + 1}
            </label>
            <input
              id={`${uid}-${item.id}`}
              value={item.label}
              maxLength={200}
              onChange={(e) => {
                update(item.id, { label: e.target.value });
              }}
            />
            {scored && (
              <input
                className="score"
                type="number"
                step="any"
                aria-label={`Score for ${item.label}`}
                placeholder="0"
                value={item.score ?? ""}
                onChange={(e) => {
                  update(item.id, {
                    score: e.target.value === "" ? undefined : Number(e.target.value),
                  });
                }}
              />
            )}
            <button
              type="button"
              className="icon"
              aria-label={`Move ${item.label} up`}
              disabled={i === 0}
              onClick={() => {
                const next = [...items];
                const [moved] = next.splice(i, 1);
                if (moved) next.splice(i - 1, 0, moved);
                onChange(next);
              }}
            >
              ↑
            </button>
            <button
              type="button"
              className="icon"
              aria-label={`Remove ${item.label}`}
              disabled={items.length <= min}
              onClick={() => {
                onChange(items.filter((it) => it.id !== item.id));
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      {items.length < max && (
        <button
          type="button"
          className="ghost small"
          onClick={() => {
            onChange([...items, newItem(items.length + 1)]);
          }}
        >
          + Add
        </button>
      )}
    </fieldset>
  );
}
