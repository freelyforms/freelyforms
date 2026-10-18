import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type ResponsesPage, type Role } from "./api.js";

const GOOGLE_PROBLEMS: Record<string, string> = {
  google_access_required:
    "The form's owner needs to reconnect Google before responses can be shown.",
};

/**
 * Responses read from the owner's sheet when you look (ADR 0024); nothing is stored by the app.
 * Editors and the owner can correct an answer: it is written straight into the sheet.
 */
export function Responses({ formId, role }: { formId: string; role: Role }) {
  const [data, setData] = useState<ResponsesPage | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ row: string; key: string; value: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const canEdit = role !== "viewer";

  const load = useCallback(() => {
    api.responses(formId, page).then(
      (d) => {
        setData(d);
        setError(null);
      },
      (err: unknown) => {
        setError(
          (err instanceof ApiError && GOOGLE_PROBLEMS[err.code]) ||
            "Responses could not be loaded from the sheet. Please try again.",
        );
      },
    );
  }, [formId, page]);
  useEffect(load, [load]);

  const saveEdit = async () => {
    if (!editing) return;
    const { row, key, value } = editing;
    setEditing(null);
    try {
      await api.editResponse(formId, row, key, value);
      setData(
        (d) =>
          d && {
            ...d,
            rows: d.rows.map((r) =>
              r.submissionId === row ? { ...r, cells: { ...r.cells, [key]: value } } : r,
            ),
          },
      );
      setNote("Saved to the sheet.");
    } catch {
      setNote("That change could not be saved. Please try again.");
    }
  };

  return (
    <section className="card responses">
      <div className="status-row">
        <h2 className="section-title">Responses</h2>
        <span className="spacer" />
        <button type="button" className="ghost small" onClick={load}>
          Refresh
        </button>
      </div>
      <p className="helper">
        Read from the Google Sheet when you open this tab; Freely Forms doesn't keep a copy.
        {canEdit ? " Select an answer to correct it in the sheet." : ""}
      </p>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p className="muted small" role="status">
          {note}
        </p>
      )}
      {data === null && !error && <p className="muted">Loading…</p>}
      {data?.total === 0 && <p className="muted">No responses yet.</p>}
      {data && data.total > 0 && (
        <>
          <div className="table-wrap">
            <table className="responses-table">
              <thead>
                <tr>
                  {data.columns.map((c) => (
                    <th key={c.key} scope="col">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.submissionId}>
                    {data.columns.map((c) => {
                      const value = String(r.cells[c.key] ?? "");
                      const active = editing?.row === r.submissionId && editing.key === c.key;
                      return (
                        <td key={c.key}>
                          {active ? (
                            <input
                              aria-label={`${c.label} for response ${r.submissionId}`}
                              value={editing.value}
                              autoFocus
                              onChange={(e) => {
                                setEditing({ ...editing, value: e.target.value });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void saveEdit();
                                if (e.key === "Escape") setEditing(null);
                              }}
                              onBlur={() => void saveEdit()}
                            />
                          ) : canEdit && c.editable ? (
                            <button
                              type="button"
                              className="cell"
                              aria-label={`Edit ${c.label}: ${value || "empty"}`}
                              onClick={() => {
                                setNote(null);
                                setEditing({ row: r.submissionId, key: c.key, value });
                              }}
                            >
                              {value}
                            </button>
                          ) : (
                            value
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="status-row">
            <span className="muted small">
              {data.total} response{data.total === 1 ? "" : "s"} · page {data.page} of {data.pages}
            </span>
            <span className="spacer" />
            <button
              type="button"
              className="ghost small"
              disabled={page <= 1}
              onClick={() => {
                setPage((p) => p - 1);
              }}
            >
              Newer
            </button>
            <button
              type="button"
              className="ghost small"
              disabled={page >= data.pages}
              onClick={() => {
                setPage((p) => p + 1);
              }}
            >
              Older
            </button>
          </div>
        </>
      )}
    </section>
  );
}
