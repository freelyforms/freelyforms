import type { Form } from "@freelyforms/form-schema";
import { useId } from "react";
import { updateSettings } from "./draft.js";

const DEFAULT_ACCENT = "#1f5fd6";
const SCHEMES = [
  ["auto", "Match the visitor's device"],
  ["light", "Always light"],
  ["dark", "Always dark"],
] as const;

export function DesignPanel({ form, onChange }: { form: Form; onChange: (form: Form) => void }) {
  const uid = useId();
  const theme = form.settings?.theme ?? {};
  const accent = theme.accent ?? DEFAULT_ACCENT;
  const setTheme = (patch: Record<string, string | undefined>) => {
    onChange(updateSettings(form, { theme: { ...theme, ...patch } }));
  };

  return (
    <div className="card design">
      <h2 className="small-heading">Appearance</h2>
      <div className="color-row">
        <label className="field-label" htmlFor={`${uid}-accent`}>
          Accent colour
        </label>
        <input
          id={`${uid}-accent`}
          type="color"
          value={accent}
          onChange={(e) => {
            setTheme({ accent: e.target.value });
          }}
        />
        <code>{accent}</code>
        {theme.accent && (
          <button
            type="button"
            className="link"
            onClick={() => {
              setTheme({ accent: undefined });
            }}
          >
            Reset
          </button>
        )}
      </div>
      <p className="muted small">Used for the submit button, selection and focus outlines.</p>

      <fieldset className="radios">
        <legend className="field-label">Light or dark</legend>
        {SCHEMES.map(([value, label]) => (
          <label key={value} className="check">
            <input
              type="radio"
              name={`${uid}-scheme`}
              value={value}
              checked={(theme.colorScheme ?? "auto") === value}
              onChange={() => {
                setTheme({ colorScheme: value === "auto" ? undefined : value });
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <h2 className="small-heading">Texts</h2>
      <label className="field-label" htmlFor={`${uid}-submit`}>
        Submit button
      </label>
      <input
        id={`${uid}-submit`}
        placeholder="Submit"
        value={form.settings?.submitLabel ?? ""}
        maxLength={60}
        onChange={(e) => {
          onChange(updateSettings(form, { submitLabel: e.target.value }));
        }}
      />
      <label className="field-label" htmlFor={`${uid}-success`}>
        Message after submitting
      </label>
      <textarea
        id={`${uid}-success`}
        rows={3}
        placeholder="Thanks — your response was received."
        value={form.settings?.success?.message ?? ""}
        maxLength={2000}
        onChange={(e) => {
          const message = e.target.value;
          onChange(
            updateSettings(form, { success: message ? { type: "message", message } : undefined }),
          );
        }}
      />
    </div>
  );
}
