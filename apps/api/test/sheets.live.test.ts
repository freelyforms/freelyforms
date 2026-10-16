/**
 * Live check against Google with the developer's own account. Skipped unless
 * FREELYFORMS_LIVE_GOOGLE=1. Prerequisites: `pnpm --filter @freelyforms/api dev` has been used to
 * sign in at http://localhost:8787 with Drive access, and apps/api/.dev.vars holds the secrets.
 *
 * Creates a spreadsheet "Freely Forms test responses" in the signed-in user's Drive.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createKeyring, decryptText, importMasterKey, type Envelope } from "@freelyforms/crypto";
import { validateSubmission } from "@freelyforms/form-engine";
import {
  appendRows,
  buildRow,
  createResponseSpreadsheet,
  refreshAccessToken,
  resolveColumns,
  sheetsClient,
} from "@freelyforms/google";
import { parseForm } from "@freelyforms/form-schema";
import { describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

const root = join(import.meta.dirname, "..");
const live = process.env.FREELYFORMS_LIVE_GOOGLE === "1";

function devVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of readFileSync(join(root, ".dev.vars"), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m?.[1] !== undefined && m[2] !== undefined) vars[m[1]] = m[2];
  }
  return vars;
}

describe.skipIf(!live)("live Google Sheets delivery", () => {
  it("creates a response sheet and appends typed rows", async () => {
    const vars = devVars();
    const proxy = await getPlatformProxy<{ DB: D1Database }>({
      configPath: join(root, "wrangler.jsonc"),
      // The same local state `wrangler dev` uses in apps/api.
      persist: { path: join(root, ".wrangler/state/v3") },
    });
    try {
      const row = await proxy.env.DB.prepare(
        "SELECT user_id, refresh_token FROM google_connections WHERE status = 'active' AND scopes LIKE '%drive.file%' LIMIT 1",
      ).first<{ user_id: string; refresh_token: string }>();
      if (!row) throw new Error("Sign in at http://localhost:8787 with Drive access first");

      const keyring = createKeyring(await importMasterKey("k1", vars.MASTER_KEY_K1 ?? ""));
      const refreshToken = await decryptText(
        keyring,
        JSON.parse(row.refresh_token) as Envelope,
        `google-refresh:${row.user_id}`,
      );
      const access = await refreshAccessToken(fetch, {
        clientId: vars.GOOGLE_CLIENT_ID ?? "",
        clientSecret: vars.GOOGLE_CLIENT_SECRET ?? "",
        refreshToken,
        now: Date.now(),
      });
      const client = sheetsClient(fetch, access.token);

      const parsed = parseForm(
        JSON.parse(
          readFileSync(join(root, "../../packages/form-schema/fixtures/all-fields.json"), "utf8"),
        ),
      );
      if (!parsed.success) throw new Error("fixture");
      const form = parsed.form;

      const dest = await createResponseSpreadsheet(client, {
        title: "Freely Forms test responses",
        form,
      });
      const columns = await resolveColumns(client, dest);
      expect(columns.size).toBe(3 + form.fields.length);

      const answers = [
        {
          fld_name: '=IMPORTXML("https://example.com","//a")',
          fld_email: "grace@example.org",
          fld_guests: "2",
          fld_date: "2026-06-30",
          fld_ticket: "opt_vip",
          fld_sessions: ["opt_evening", "opt_morning"],
          fld_consent: "on",
        },
        {
          fld_name: "Ada Lovelace",
          fld_email: "ada@example.com",
          fld_ticket: "opt_standard",
          fld_consent: true,
        },
      ];
      const rows = answers.map((a, i) => {
        const v = validateSubmission(form, a);
        if (!v.ok) throw new Error(JSON.stringify(v.errors));
        return buildRow(form, columns, {
          submissionId: `live-test-${String(i + 1)}`,
          submittedAt: Date.now(),
          formVersion: 1,
          values: v.values,
        });
      });
      await appendRows(client, dest, rows);

      // Read back what Sheets stored: the formula-like answer must be a string, not a formula.
      const grid = await client.call<{
        sheets: {
          data: { rowData?: { values?: { userEnteredValue?: Record<string, unknown> }[] }[] }[];
        }[];
      }>(
        `/${dest.spreadsheetId}?includeGridData=true&ranges=A1:N3&fields=sheets.data.rowData.values.userEnteredValue`,
      );
      const stored = grid.sheets[0]?.data[0]?.rowData ?? [];
      const nameCol = columns.get("fld_name") ?? -1;
      expect(stored[1]?.values?.[nameCol]?.userEnteredValue).toEqual({
        stringValue: '=IMPORTXML("https://example.com","//a")',
      });
      expect(stored[1]?.values?.[columns.get("fld_guests") ?? -1]?.userEnteredValue).toEqual({
        numberValue: 2,
      });
      expect(stored[2]?.values?.[0]?.userEnteredValue).toEqual({ stringValue: "live-test-2" });
      console.info(`Live test spreadsheet: ${dest.url}`);
    } finally {
      await proxy.dispose();
    }
  }, 60_000);
});
