/** Stateful fake of the Google token endpoint and the Sheets API calls the app makes. */
interface Meta {
  metadataKey: string;
  metadataValue: string;
  location: { dimensionRange: { sheetId: number; startIndex: number } };
}
interface Sheet {
  sheetId: number;
  columnCount: number;
  rows: unknown[][];
  meta: Meta[];
}

export interface FakeFile {
  id: string;
  name: string;
  size: string;
  mimeType: string;
  parents: string[];
  appProperties: Record<string, string>;
  createdTime: string;
}

export function fakeGoogle() {
  const sheets = new Map<string, Sheet>();
  const state = {
    revoked: false,
    /** Fail the next append: `before` = not written, `after` = written but the response was lost. */
    failNextAppend: null as null | { status: number | "network"; when: "before" | "after" },
    calls: [] as string[],
    /** Clock for Drive creation times (ms). */
    now: 0,
  };
  let n = 0;

  const json = (body: unknown, status = 200) => Promise.resolve(Response.json(body, { status }));
  const fail = (status: number) =>
    json({ error: { code: status, message: "fake", errors: [] } }, status);

  /** Drive (ADR 0007): folders, resumable sessions, metadata, marking, clean-up queries. */
  const files = new Map<string, FakeFile>();
  const sessions = new Map<string, Omit<FakeFile, "id" | "size" | "createdTime">>();
  const drive = (url: URL, init: RequestInit | undefined, body: Record<string, unknown>) => {
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    if (url.pathname === "/upload/drive/v3/files" && method === "POST") {
      const id = `s${String(++n)}`;
      sessions.set(id, {
        name: String(body.name),
        mimeType: headers.get("x-upload-content-type") ?? "application/octet-stream",
        parents: (body.parents as string[] | undefined) ?? [],
        appProperties: (body.appProperties as Record<string, string> | undefined) ?? {},
      });
      // The browser uploads to this session URI; tests and the e2e Worker complete it.
      return Promise.resolve(
        new Response(null, {
          status: 200,
          headers: { location: `${headers.get("origin") ?? ""}/__e2e/drive-upload/${id}` },
        }),
      );
    }
    if (url.pathname === "/drive/v3/files" && method === "POST") {
      const id = `fold${String(++n)}`;
      files.set(id, {
        id,
        name: String(body.name),
        size: "0",
        mimeType: String(body.mimeType),
        parents: [],
        appProperties: {},
        createdTime: new Date(state.now).toISOString(),
      });
      return json({ id });
    }
    if (url.pathname === "/drive/v3/files" && method === "GET") {
      // Only the clean-up query is supported: folder, unattached, created before a time.
      const q = url.searchParams.get("q") ?? "";
      const folder = /'([^']+)' in parents/.exec(q)?.[1];
      const before = /createdTime < '([^']+)'/.exec(q)?.[1] ?? "";
      return json({
        files: [...files.values()]
          .filter(
            (f) =>
              f.parents.includes(folder ?? "") &&
              f.appProperties.freelyAttached === "0" &&
              f.createdTime < before,
          )
          .map((f) => ({ id: f.id })),
      });
    }
    const id = decodeURIComponent(/^\/drive\/v3\/files\/(.+)$/.exec(url.pathname)?.[1] ?? "");
    const file = files.get(id);
    if (!file) return json({ error: { code: 404, message: "File not found" } }, 404);
    if (method === "GET") return json(file);
    if (method === "PATCH") {
      file.appProperties = {
        ...file.appProperties,
        ...((body.appProperties as Record<string, string> | undefined) ?? {}),
      };
      return json({ id });
    }
    if (method === "DELETE") {
      files.delete(id);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return fail(400);
  };

  /** What the browser's PUT to a session URI does: creates the file; returns its resource. */
  const completeUpload = (sessionId: string, size: number) => {
    const session = sessions.get(sessionId);
    if (!session) return null;
    sessions.delete(sessionId);
    const file: FakeFile = {
      ...session,
      id: `file${String(++n)}xyzabcdef`,
      size: String(size),
      createdTime: new Date(state.now).toISOString(),
    };
    files.set(file.id, file);
    return file;
  };

  const fetchFn: typeof fetch = (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const body =
      typeof init?.body === "string" && init.body.startsWith("{")
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    state.calls.push(`${init?.method ?? "GET"} ${url.pathname}`);

    if (url.hostname === "www.googleapis.com") return drive(url, init, body);
    if (url.hostname === "oauth2.googleapis.com") {
      return state.revoked
        ? json({ error: "invalid_grant" }, 400)
        : json({ access_token: "ya29.fake", expires_in: 3600, scope: "openid" });
    }
    const m =
      /^\/v4\/spreadsheets(?:\/([^/:]+))?(?::(batchUpdate)|\/(developerMetadata:search|values:batchGetByDataFilter))?$/.exec(
        url.pathname,
      );
    if (!m) return fail(400);
    const [, id, batch, sub] = m;

    if (!id) {
      const spreadsheetId = `sheet${String(++n)}`;
      const header = (
        (
          body.sheets as {
            data: { rowData: { values: { userEnteredValue: { stringValue: string } }[] }[] }[];
          }[]
        )[0]?.data[0]?.rowData[0]?.values ?? []
      ).map((v) => v.userEnteredValue.stringValue);
      sheets.set(spreadsheetId, {
        sheetId: 7,
        columnCount: header.length,
        rows: [header],
        meta: [],
      });
      return json({
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        sheets: [{ properties: { sheetId: 7 } }],
      });
    }
    const sheet = sheets.get(id);
    if (!sheet) return fail(404);

    if (!batch && !sub && (init?.method ?? "GET") === "GET") {
      return json({
        sheets: [
          {
            properties: {
              sheetId: sheet.sheetId,
              gridProperties: { columnCount: sheet.columnCount },
            },
          },
        ],
      });
    }
    if (batch) {
      for (const req of body.requests as Record<string, Record<string, unknown>>[]) {
        if (req.addSheet) {
          // The fake keeps one tab per spreadsheet: adding a tab replaces it.
          sheet.sheetId += 100;
          sheet.rows = [[]];
          sheet.meta = [];
          sheet.columnCount = (
            req.addSheet as { properties: { gridProperties: { columnCount: number } } }
          ).properties.gridProperties.columnCount;
          return json({ replies: [{ addSheet: { properties: { sheetId: sheet.sheetId } } }] });
        }
        if (req.appendDimension)
          sheet.columnCount += (req.appendDimension as { length: number }).length;
        if (req.createDeveloperMetadata)
          sheet.meta.push(
            (req.createDeveloperMetadata as { developerMetadata: Meta }).developerMetadata,
          );
        if (req.updateCells) {
          const u = req.updateCells as {
            start: { columnIndex: number };
            rows: { values: { userEnteredValue: { stringValue: string } }[] }[];
          };
          const header = sheet.rows[0] as unknown[];
          u.rows[0]?.values.forEach((v, i) => {
            header[u.start.columnIndex + i] = v.userEnteredValue.stringValue;
          });
        }
        if (req.appendCells) {
          const failure = state.failNextAppend;
          state.failNextAppend = null;
          if (failure?.when === "before")
            return failure.status === "network"
              ? Promise.reject(new TypeError("network"))
              : fail(failure.status);
          const a = req.appendCells as {
            sheetId: number;
            rows: { values: { userEnteredValue?: Record<string, unknown> }[] }[];
          };
          if (a.sheetId !== sheet.sheetId)
            return json(
              { error: { code: 400, message: `No grid with id: ${String(a.sheetId)}` } },
              400,
            );
          for (const r of a.rows)
            sheet.rows.push(
              r.values.map((v) => (v.userEnteredValue ? Object.values(v.userEnteredValue)[0] : "")),
            );
          if (failure?.when === "after")
            return failure.status === "network"
              ? Promise.reject(new TypeError("network"))
              : fail(failure.status);
        }
      }
      return json({});
    }
    if (sub === "developerMetadata:search") {
      return json({
        matchedDeveloperMetadata: sheet.meta.map((developerMetadata) => ({ developerMetadata })),
      });
    }
    // values:batchGetByDataFilter: the header row (gridRange) or the _submission_id column
    const filters = (body.dataFilters ?? []) as { gridRange?: unknown }[];
    if (filters[0]?.gridRange) {
      return json({ valueRanges: [{ valueRange: { values: [sheet.rows[0] ?? []] } }] });
    }
    const col = sheet.meta.find((x) => x.metadataValue === "_submission_id")?.location
      .dimensionRange.startIndex;
    return json({
      valueRanges:
        col === undefined
          ? []
          : [{ valueRange: { values: [sheet.rows.map((r) => r[col] ?? "")] } }],
    });
  };

  return { fetchFn, sheets, state, files, completeUpload };
}
