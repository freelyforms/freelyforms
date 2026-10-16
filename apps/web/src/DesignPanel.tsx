import type { Form } from "@freelyforms/form-schema";
import { useId } from "react";
import { updateSettings } from "./draft.js";

const DEFAULT_ACCENT = "#1f5fd6";
const SCHEMES = [
  ["auto", "Match device"],
  ["light", "Light"],
  ["dark", "Dark"],
] as const;

export function DesignPanel({ form, onChange }: { form: Form; onChange: (form: Form) => void }) {
  const uid = useId();
  const theme = form.settings?.theme ?? {};
  const accent = theme.accent ?? DEFAULT_ACCENT;
  const scheme = theme.colorScheme ?? "auto";
  const setTheme = (patch: Record<string, string | undefined>) => {
    onChange(updateSettings(form, { theme: { ...theme, ...patch } }));
  };

  return (
    <div className="stack">
      <section className="card">
        <h2 className="section-title">Appearance</h2>

        <span className="field-label" id={`${uid}-accent-label`}>
          Accent colour
        </span>
        <div className="color-control">
          <input
            aria-labelledby={`${uid}-accent-label`}
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
              className="ghost small"
              onClick={() => {
                setTheme({ accent: undefined });
              }}
            >
              Reset
            </button>
          )}
        </div>
        <p className="helper">Buttons, selections and focus outlines.</p>

        <span className="field-label" id={`${uid}-theme-label`}>
          Theme
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby={`${uid}-theme-label`}>
          {SCHEMES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={scheme === value}
              className={scheme === value ? "selected" : undefined}
              onClick={() => {
                setTheme({ colorScheme: value === "auto" ? undefined : value });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Submission</h2>
        <label className="field-label" htmlFor={`${uid}-submit`}>
          Submit button label
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
          Success message
        </label>
        <textarea
          id={`${uid}-success`}
          rows={2}
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
      </section>
    </div>
  );
}
