import type { Form } from "@freelyforms/form-schema";
import { useId, useState } from "react";
import { updateSettings } from "./draft.js";

const DEFAULT_ACCENT = "#1f5fd6";

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};
const FONTS = [
  ["system", "System"],
  ["serif", "Serif"],
  ["rounded", "Rounded"],
  ["mono", "Mono"],
] as const;
const CORNERS = [
  ["square", "Square"],
  ["rounded", "Rounded"],
  ["pill", "Pill"],
] as const;
const DENSITIES = [
  ["comfortable", "Comfortable"],
  ["compact", "Compact"],
] as const;
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
  const success = form.settings?.success;
  const [after, setAfter] = useState<"message" | "redirect">(success?.type ?? "message");
  const [url, setUrl] = useState(success?.type === "redirect" ? success.url : "");
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
        <div className="segmented" role="group" aria-labelledby={`${uid}-theme-label`}>
          {SCHEMES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={scheme === value}
              className={scheme === value ? "selected" : undefined}
              onClick={() => {
                setTheme({ colorScheme: value === "auto" ? undefined : value });
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {(
          [
            ["font", "Font", FONTS, "system"],
            ["corners", "Corners", CORNERS, "rounded"],
            ["density", "Spacing", DENSITIES, "comfortable"],
          ] as const
        ).map(([key, title, options, fallback]) => (
          <div key={key}>
            <span className="field-label" id={`${uid}-${key}-label`}>
              {title}
            </span>
            <div className="segmented" role="group" aria-labelledby={`${uid}-${key}-label`}>
              {options.map(([value, label]) => {
                const current = theme[key] ?? fallback;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={current === value}
                    className={current === value ? "selected" : undefined}
                    onClick={() => {
                      // The default is stored as "not set", keeping exported forms small.
                      setTheme({ [key]: value === fallback ? undefined : value });
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <p className="helper">
          Fonts are the respondent's own system fonts; nothing is downloaded.
        </p>

        <span className="field-label" id={`${uid}-mode-label`}>
          Layout
        </span>
        <div className="segmented" role="group" aria-labelledby={`${uid}-mode-label`}>
          {(
            [
              ["classic", "All questions"],
              ["conversational", "One question at a time"],
            ] as const
          ).map(([value, label]) => {
            const current = form.settings?.mode ?? "classic";
            return (
              <button
                key={value}
                type="button"
                aria-pressed={current === value}
                className={current === value ? "selected" : undefined}
                onClick={() => {
                  onChange(updateSettings(form, { mode: value === "classic" ? undefined : value }));
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="helper">
          One at a time shows each question on its own with Back and Next; page break titles show
          with the first question of their page.
        </p>
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
        <span className="field-label" id={`${uid}-after-label`}>
          After submitting
        </span>
        <div className="segmented" role="group" aria-labelledby={`${uid}-after-label`}>
          {(
            [
              ["message", "Show a message"],
              ["redirect", "Go to a web page"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={after === value}
              className={after === value ? "selected" : undefined}
              onClick={() => {
                setAfter(value);
                if (value === "message") {
                  onChange(updateSettings(form, { success: undefined }));
                } else if (isHttpsUrl(url)) {
                  onChange(updateSettings(form, { success: { type: "redirect", url } }));
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {after === "message" ? (
          <>
            <label className="field-label" htmlFor={`${uid}-success`}>
              Message
            </label>
            <textarea
              id={`${uid}-success`}
              rows={2}
              placeholder="Thanks — your response was received."
              value={success?.type === "message" ? success.message : ""}
              maxLength={2000}
              onChange={(e) => {
                const message = e.target.value;
                onChange(
                  updateSettings(form, {
                    success: message ? { type: "message", message } : undefined,
                  }),
                );
              }}
            />
          </>
        ) : (
          <>
            <label className="field-label" htmlFor={`${uid}-url`}>
              Web page address
            </label>
            <input
              id={`${uid}-url`}
              type="url"
              inputMode="url"
              placeholder="https://example.com/thank-you"
              value={url}
              maxLength={2000}
              aria-invalid={url !== "" && !isHttpsUrl(url)}
              aria-describedby={`${uid}-url-help`}
              onChange={(e) => {
                const next = e.target.value.trim();
                setUrl(next);
                // Only a complete https address is saved; until then the form keeps its message.
                onChange(
                  updateSettings(form, {
                    success: isHttpsUrl(next) ? { type: "redirect", url: next } : undefined,
                  }),
                );
              }}
            />
            <p className="helper" id={`${uid}-url-help`}>
              {url !== "" && !isHttpsUrl(url)
                ? "Use a full address starting with https://"
                : "Respondents go there after their answers are accepted. An embedded form takes the whole page there."}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
