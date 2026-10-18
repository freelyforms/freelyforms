import type { ConditionRule, Field, ShowIf } from "@freelyforms/form-schema";
import {
  OPERATORS_BY_TYPE,
  VALUELESS_OPERATORS,
  type ConditionOperator,
} from "@freelyforms/form-schema/limits";
import { useId } from "react";
import { hasOptions } from "./draft.js";

interface Props {
  /** What the conditions show: a question, or a whole page (ADR 0018). */
  subject: "question" | "page";
  showIf: ShowIf | undefined;
  /** Fields above this one: the only ones a condition may test (ADR 0017). */
  earlier: readonly Field[];
  onChange: (showIf: ShowIf | undefined) => void;
}

/** How an operator reads for a source field, e.g. "includes" for checkboxes. */
function operatorLabel(op: ConditionOperator, source: Field): string {
  const multi = source.type === "checkboxes" || source.type === "multiselect";
  const when = source.type === "date";
  switch (op) {
    case "equals":
      return "is";
    case "not_equals":
      return "is not";
    case "contains":
      return multi ? "includes" : "contains";
    case "not_contains":
      return multi ? "doesn't include" : "doesn't contain";
    case "greater_than":
      return when ? "is after" : "is more than";
    case "less_than":
      return when ? "is before" : "is less than";
    case "is_empty":
      return source.type === "consent" ? "is not ticked" : "is not answered";
    case "is_not_empty":
      return source.type === "consent" ? "is ticked" : "is answered";
  }
}

/**
 * A rule that already passes the schema, so adding one never leaves the draft unsaved: "is <first
 * option>" for choices, "is answered" for everything else (it needs no value).
 */
function defaultRule(source: Field): ConditionRule {
  const op = hasOptions(source)
    ? (OPERATORS_BY_TYPE[source.type][0] ?? "is_not_empty")
    : "is_not_empty";
  return withValue({ field: source.id, op }, source);
}

/** Gives the rule a value of the right kind for its operator, or none. */
function withValue(rule: ConditionRule, source: Field): ConditionRule {
  const { field, op } = rule;
  if (VALUELESS_OPERATORS.includes(op)) return { field, op };
  if (hasOptions(source)) {
    const kept = source.options.some((o) => o.id === rule.value) ? rule.value : undefined;
    return { field, op, value: kept ?? source.options[0]?.id ?? "" };
  }
  if (source.type === "number") {
    return { field, op, value: typeof rule.value === "number" ? rule.value : 0 };
  }
  return { field, op, value: typeof rule.value === "string" ? rule.value : "" };
}

/** "Show only if…" for one field: rules on earlier answers, matched all or any. */
export function Conditions({ subject, showIf, earlier, onChange }: Props) {
  const uid = useId();
  const sources = earlier;
  const last = sources[sources.length - 1];
  if (!last) return null;

  if (!showIf) {
    return (
      <button
        type="button"
        className="ghost small"
        onClick={() => {
          onChange({ match: "all", rules: [defaultRule(last)] });
        }}
      >
        + Show only if…
      </button>
    );
  }

  const setRule = (index: number, rule: ConditionRule) => {
    onChange({ ...showIf, rules: showIf.rules.map((r, i) => (i === index ? rule : r)) });
  };
  const removeRule = (index: number) => {
    const rules = showIf.rules.filter((_, i) => i !== index);
    onChange(rules.length ? { ...showIf, rules } : undefined);
  };

  return (
    <fieldset className="conditions">
      <legend className="field-label">
        Show this {subject} only if{" "}
        {showIf.rules.length > 1 ? (
          <>
            <select
              aria-label="Which conditions must hold"
              value={showIf.match}
              onChange={(e) => {
                onChange({ ...showIf, match: e.target.value === "any" ? "any" : "all" });
              }}
            >
              <option value="all">all</option>
              <option value="any">any</option>
            </select>{" "}
            of these hold
          </>
        ) : null}
      </legend>
      <ol className="rules">
        {showIf.rules.map((rule, index) => {
          const source = sources.find((f) => f.id === rule.field);
          const key = `${uid}-${String(index)}`;
          return (
            <li key={key} className="rule">
              <select
                aria-label={`Condition ${String(index + 1)}: question`}
                value={source ? rule.field : ""}
                onChange={(e) => {
                  const next = sources.find((f) => f.id === e.target.value);
                  if (next) setRule(index, defaultRule(next));
                }}
              >
                {!source && <option value="">Choose a question</option>}
                {sources.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              {source && (
                <select
                  aria-label={`Condition ${String(index + 1)}: test`}
                  value={rule.op}
                  onChange={(e) => {
                    setRule(
                      index,
                      withValue({ ...rule, op: e.target.value as ConditionOperator }, source),
                    );
                  }}
                >
                  {OPERATORS_BY_TYPE[source.type].map((op) => (
                    <option key={op} value={op}>
                      {operatorLabel(op, source)}
                    </option>
                  ))}
                </select>
              )}
              {source && !VALUELESS_OPERATORS.includes(rule.op) && (
                <RuleValue
                  label={`Condition ${String(index + 1)}: value`}
                  source={source}
                  value={rule.value}
                  onChange={(value) => {
                    setRule(index, { ...rule, value });
                  }}
                />
              )}
              <button
                type="button"
                className="icon"
                aria-label={`Remove condition ${String(index + 1)}`}
                onClick={() => {
                  removeRule(index);
                }}
              >
                ×
              </button>
            </li>
          );
        })}
      </ol>
      {showIf.rules.length < 10 && (
        <button
          type="button"
          className="ghost small"
          onClick={() => {
            onChange({ ...showIf, rules: [...showIf.rules, defaultRule(last)] });
          }}
        >
          + Add condition
        </button>
      )}
    </fieldset>
  );
}

function RuleValue({
  label,
  source,
  value,
  onChange,
}: {
  label: string;
  source: Field;
  value: string | number | undefined;
  onChange: (value: string | number) => void;
}) {
  if (hasOptions(source)) {
    return (
      <select
        aria-label={label}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {source.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (source.type === "number") {
    return (
      <input
        aria-label={label}
        type="number"
        step="any"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(n);
        }}
      />
    );
  }
  return (
    <input
      aria-label={label}
      type={source.type === "date" ? "date" : "text"}
      maxLength={1000}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => {
        onChange(e.target.value);
      }}
    />
  );
}
