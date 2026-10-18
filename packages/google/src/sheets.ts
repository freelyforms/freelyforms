import type { AnswerValue } from "@freelyforms/form-engine";
import { answerFields, type Field, type Form } from "@freelyforms/form-schema";
import { errorFromResponse, GoogleApiError } from "./errors.js";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

/** Developer metadata key that ties a column to a field ID (ADR 0004). */
export const FIELD_METADATA_KEY = "app_field_id";
/** Columns maintained by the platform, always first (ADR 0003). */
export const SYSTEM_COLUMNS = ["_submission_id", "_submitted_at", "_form_version"] as const;
export const RESPONSES_TAB = "Responses";

export interface SheetsClient {
  /** Calls the Sheets API and returns parsed JSON, or throws `GoogleApiError`. */
  call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

/** A Sheets client for one access token. */
export function sheetsClient(fetchFn: typeof fetch, accessToken: string): SheetsClient {
  return {
    async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
      let res: Response;
      try {
        res = await fetchFn(`${SHEETS}${path}`, {
          method: init.method ?? "GET",
          headers: {
            authorization: `Bearer ${accessToken}`,
            ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        });
      } catch {
        throw new GoogleApiError("TRANSIENT", 0, "network");
      }
      if (!res.ok) throw await errorFromResponse(res);
      return (await res.json()) as T;
    },
  };
}

interface CellData {
  userEnteredValue?: { stringValue?: string; numberValue?: number; boolValue?: boolean };
  userEnteredFormat?: { textFormat: { bold: boolean } };
}

const text = (value: string): CellData => ({ userEnteredValue: { stringValue: value } });

/** Header labels, disambiguated when two fields share a label. */
export function headerLabels(form: Pick<Form, "fields">): string[] {
  const seen = new Map<string, number>();
  return answerFields(form).map((field) => {
    const count = (seen.get(field.label) ?? 0) + 1;
    seen.set(field.label, count);
    return count === 1 ? field.label : `${field.label} (${String(count)})`;
  });
}

function columnMetadata(sheetId: number, key: string, index: number) {
  return {
    createDeveloperMetadata: {
      developerMetadata: {
        metadataKey: FIELD_METADATA_KEY,
        metadataValue: key,
        visibility: "PROJECT",
        location: {
          dimensionRange: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
        },
      },
    },
  };
}

export interface Destination {
  spreadsheetId: string;
  sheetId: number;
}

/**
 * Creates the owner's response spreadsheet (via `drive.file`, so the app can only ever see files
 * it created or the owner picked): one frozen, bold header row, system columns first, and
 * developer metadata on every column.
 */
export async function createResponseSpreadsheet(
  client: SheetsClient,
  args: { title: string; form: Pick<Form, "fields"> },
): Promise<Destination & { url: string }> {
  const headers = [...SYSTEM_COLUMNS, ...headerLabels(args.form)];
  const created = await client.call<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheets: { properties: { sheetId: number } }[];
  }>("", {
    method: "POST",
    body: {
      properties: { title: args.title },
      sheets: [
        {
          properties: {
            title: RESPONSES_TAB,
            gridProperties: { frozenRowCount: 1, columnCount: headers.length },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: headers.map((h) => ({
                    ...text(h),
                    userEnteredFormat: { textFormat: { bold: true } },
                  })),
                },
              ],
            },
          ],
        },
      ],
    },
  });
  const sheetId = created.sheets[0]?.properties.sheetId;
  if (sheetId === undefined) throw new GoogleApiError("INVALID_REQUEST", 200, "no_sheet_created");
  const keys = [...SYSTEM_COLUMNS, ...answerFields(args.form).map((f) => f.id)];
  await client.call(`/${created.spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: { requests: keys.map((key, i) => columnMetadata(sheetId, key, i)) },
  });
  return { spreadsheetId: created.spreadsheetId, sheetId, url: created.spreadsheetUrl };
}

/** Header row cells: bold, system columns first. */
const headerRow = (form: Pick<Form, "fields">) => ({
  values: [...SYSTEM_COLUMNS, ...headerLabels(form)].map((h) => ({
    ...text(h),
    userEnteredFormat: { textFormat: { bold: true } },
  })),
});

/**
 * Adds a responses tab to a spreadsheet the owner picked (ADR 0006): the owner's existing tabs are
 * never touched. The tab gets the same header row and column metadata as a created spreadsheet. A
 * taken tab name gets a numeric suffix.
 */
export async function addResponseTab(
  client: SheetsClient,
  spreadsheetId: string,
  args: { title: string; form: Pick<Form, "fields"> },
): Promise<Destination> {
  const columnCount = SYSTEM_COLUMNS.length + answerFields(args.form).length;
  const base = args.title.slice(0, 90);
  let sheetId: number | undefined;
  for (let attempt = 1; sheetId === undefined; attempt++) {
    const title = attempt === 1 ? base : `${base} (${String(attempt)})`;
    try {
      const reply = await client.call<{
        replies: { addSheet?: { properties: { sheetId: number } } }[];
      }>(`/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        body: {
          requests: [
            {
              addSheet: {
                properties: { title, gridProperties: { frozenRowCount: 1, columnCount } },
              },
            },
          ],
        },
      });
      sheetId = reply.replies[0]?.addSheet?.properties.sheetId;
      if (sheetId === undefined) throw new GoogleApiError("INVALID_REQUEST", 200, "no_sheet_added");
    } catch (err) {
      const taken =
        err instanceof GoogleApiError &&
        err.kind === "INVALID_REQUEST" &&
        /already exists/i.test(err.detail ?? "");
      if (!taken || attempt >= 5) throw err;
    }
  }
  const keys = [...SYSTEM_COLUMNS, ...answerFields(args.form).map((f) => f.id)];
  const dest = { spreadsheetId, sheetId };
  try {
    await client.call(`/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: {
        requests: [
          {
            updateCells: {
              start: { sheetId, rowIndex: 0, columnIndex: 0 },
              rows: [headerRow(args.form)],
              fields: "userEnteredValue,userEnteredFormat.textFormat.bold",
            },
          },
          ...keys.map((key, i) => columnMetadata(sheetId, key, i)),
        ],
      },
    });
  } catch (err) {
    await deleteTab(client, dest); // never leave a half-made tab in the owner's spreadsheet
    throw err;
  }
  return dest;
}

/** Removes a tab Freely Forms added (best effort; used when attaching fails half-way). */
export async function deleteTab(client: SheetsClient, dest: Destination): Promise<void> {
  await client
    .call(`/${dest.spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: { requests: [{ deleteSheet: { sheetId: dest.sheetId } }] },
    })
    .catch(() => undefined);
}

/**
 * Renames the column of each renamed question. A header is changed only while it still shows the
 * question's previous label (or is empty), so headers the owner edited by hand, and anything that
 * is not our header row (rows inserted above it, a sorted range), are left alone. Columns are
 * found by developer metadata, never by header text.
 */
export async function syncHeaders(
  client: SheetsClient,
  dest: Destination,
  form: Pick<Form, "fields">,
  previous: Pick<Form, "fields">,
  columns: Map<string, number>,
): Promise<void> {
  const labels = headerLabels(form);
  const before = new Map(
    answerFields(previous).map((f, i) => [f.id, headerLabels(previous)[i] ?? f.label]),
  );
  const renamed = answerFields(form)
    .map((field, i) => ({ field, label: labels[i] ?? field.label, old: before.get(field.id) }))
    .filter((r) => r.old !== undefined && r.old !== r.label && columns.has(r.field.id));
  if (renamed.length === 0) return;

  const res = await client.call<{ valueRanges?: { valueRange?: { values?: unknown[][] } }[] }>(
    `/${dest.spreadsheetId}/values:batchGetByDataFilter`,
    {
      method: "POST",
      body: {
        majorDimension: "ROWS",
        dataFilters: [{ gridRange: { sheetId: dest.sheetId, startRowIndex: 0, endRowIndex: 1 } }],
      },
    },
  );
  const header = res.valueRanges?.[0]?.valueRange?.values?.[0] ?? [];
  const requests = renamed.flatMap(({ field, label, old }) => {
    const column = columns.get(field.id) ?? -1;
    const current = header[column];
    if (current !== undefined && current !== "" && current !== old) return [];
    return [
      {
        updateCells: {
          start: { sheetId: dest.sheetId, rowIndex: 0, columnIndex: column },
          rows: [{ values: [text(label)] }],
          fields: "userEnteredValue",
        },
      },
    ];
  });
  if (requests.length === 0) return;
  await client.call(`/${dest.spreadsheetId}:batchUpdate`, { method: "POST", body: { requests } });
}

/** Reads `key → column index` for one tab from developer metadata (ADR 0004). */
export async function resolveColumns(
  client: SheetsClient,
  dest: Destination,
): Promise<Map<string, number>> {
  const found = await client.call<{
    matchedDeveloperMetadata?: {
      developerMetadata: {
        metadataValue?: string;
        location?: { dimensionRange?: { sheetId?: number; startIndex?: number } };
      };
    }[];
  }>(`/${dest.spreadsheetId}/developerMetadata:search`, {
    method: "POST",
    body: {
      dataFilters: [
        { developerMetadataLookup: { metadataKey: FIELD_METADATA_KEY, locationType: "COLUMN" } },
      ],
    },
  });
  const columns = new Map<string, number>();
  for (const { developerMetadata: m } of found.matchedDeveloperMetadata ?? []) {
    const range = m.location?.dimensionRange;
    if (m.metadataValue !== undefined && range?.sheetId === dest.sheetId) {
      columns.set(m.metadataValue, range.startIndex ?? 0);
    }
  }
  return columns;
}

/** Current number of columns in the tab, including columns the owner added by hand. */
async function columnCount(client: SheetsClient, dest: Destination): Promise<number> {
  const found = await client.call<{
    sheets?: { properties: { sheetId: number; gridProperties?: { columnCount?: number } } }[];
  }>(`/${dest.spreadsheetId}?fields=sheets.properties(sheetId,gridProperties.columnCount)`);
  const tab = found.sheets?.find((s) => s.properties.sheetId === dest.sheetId);
  if (!tab) throw new GoogleApiError("TAB_MISSING", 0, "tab_not_found");
  return tab.properties.gridProperties?.columnCount ?? 0;
}

/**
 * Adds a column at the end of the tab for each field that has none yet. New columns go after every
 * existing column, so the owner's own columns are never overwritten (ADR 0005). Columns of deleted
 * fields are kept (history) and never reused.
 */
export async function addMissingColumns(
  client: SheetsClient,
  dest: Destination,
  form: Pick<Form, "fields">,
  columns: Map<string, number>,
): Promise<Map<string, number>> {
  const labels = headerLabels(form);
  const missing = answerFields(form)
    .map((field, i) => ({ field, label: labels[i] ?? field.label }))
    .filter(({ field }) => !columns.has(field.id));
  if (missing.length === 0) return columns;
  const start = await columnCount(client, dest);
  await client.call(`/${dest.spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: {
      requests: [
        {
          appendDimension: { sheetId: dest.sheetId, dimension: "COLUMNS", length: missing.length },
        },
        {
          updateCells: {
            start: { sheetId: dest.sheetId, rowIndex: 0, columnIndex: start },
            rows: [
              {
                values: missing.map(({ label }) => ({
                  ...text(label),
                  userEnteredFormat: { textFormat: { bold: true } },
                })),
              },
            ],
            fields: "userEnteredValue,userEnteredFormat.textFormat.bold",
          },
        },
        ...missing.map(({ field }, i) => columnMetadata(dest.sheetId, field.id, start + i)),
      ],
    },
  });
  const updated = new Map(columns);
  missing.forEach(({ field }, i) => updated.set(field.id, start + i));
  return updated;
}

export interface Submission {
  submissionId: string;
  submittedAt: number;
  formVersion: number;
  values: Readonly<Record<string, AnswerValue>>;
}

function optionLabels(field: Field, ids: readonly string[]): string {
  if (!("options" in field)) return ids.join(", ");
  return ids.map((id) => field.options.find((o) => o.id === id)?.label ?? id).join(", ");
}

/** Converts one answer to a typed cell. Typed cells are never parsed by Sheets (ADR 0002). */
export function answerCell(field: Field, value: AnswerValue | undefined): CellData {
  if (value === undefined) return {};
  if (typeof value === "number") return { userEnteredValue: { numberValue: value } };
  if (typeof value === "boolean") return { userEnteredValue: { boolValue: value } };
  if (typeof value === "string") {
    return text(
      field.type === "select" || field.type === "radio" ? optionLabels(field, [value]) : value,
    );
  }
  return text(optionLabels(field, value));
}

/** Builds row cells positioned by the resolved column map. */
export function buildRow(
  form: Pick<Form, "fields">,
  columns: ReadonlyMap<string, number>,
  submission: Submission,
): CellData[] {
  const cells: CellData[] = [];
  const put = (key: string, cell: CellData) => {
    const index = columns.get(key);
    if (index === undefined) return;
    while (cells.length <= index) cells.push({});
    cells[index] = cell;
  };
  put("_submission_id", text(submission.submissionId));
  put("_submitted_at", text(new Date(submission.submittedAt).toISOString()));
  put("_form_version", { userEnteredValue: { numberValue: submission.formVersion } });
  for (const field of answerFields(form))
    put(field.id, answerCell(field, submission.values[field.id]));
  return cells;
}

/**
 * Appends rows in one request. `AppendCells` addresses the tab by ID, so it keeps working when the
 * owner renames the tab, and its typed cells are never parsed as formulas (same effect as RAW).
 */
export async function appendRows(
  client: SheetsClient,
  dest: Destination,
  rows: CellData[][],
): Promise<void> {
  if (rows.length === 0) return;
  await client.call(`/${dest.spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: {
      requests: [
        {
          appendCells: {
            sheetId: dest.sheetId,
            rows: rows.map((values) => ({ values })),
            fields: "userEnteredValue",
          },
        },
      ],
    },
  });
}

/**
 * Submission IDs already present in the `_submission_id` column, found by developer metadata
 * (no tab name needed). Used only to reconcile ambiguous writes (ADR 0003).
 */
export async function existingSubmissionIds(
  client: SheetsClient,
  dest: Destination,
): Promise<Set<string>> {
  const res = await client.call<{
    valueRanges?: { valueRange?: { values?: unknown[][] } }[];
  }>(`/${dest.spreadsheetId}/values:batchGetByDataFilter`, {
    method: "POST",
    body: {
      majorDimension: "COLUMNS",
      dataFilters: [
        {
          developerMetadataLookup: {
            metadataKey: FIELD_METADATA_KEY,
            metadataValue: "_submission_id",
            locationType: "COLUMN",
          },
        },
      ],
    },
  });
  const ids = new Set<string>();
  for (const range of res.valueRanges ?? []) {
    for (const column of range.valueRange?.values ?? []) {
      for (const value of column) if (typeof value === "string") ids.add(value);
    }
  }
  return ids;
}
