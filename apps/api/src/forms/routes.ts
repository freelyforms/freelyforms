import { parseForm, type Form } from "@freelyforms/form-schema";
import {
  addMissingColumns,
  createResponseSpreadsheet,
  GoogleApiError,
  resolveColumns,
} from "@freelyforms/google";
import { Hono, type Context } from "hono";
import type { Deps } from "../env.js";
import { sheetsFor, spreadsheetUrl } from "../google-access.js";
import { requireUser, type OwnerEnv } from "../require-user.js";
import { resumeHeld } from "../delivery/hold.js";
import { newFormId, newId } from "../util.js";

interface FormRow {
  id: string;
  owner_id: string;
  title: string;
  status: "draft" | "published" | "archived";
  draft_json: string;
  published_version: number | null;
  updated_at: number;
}

interface DestinationRow {
  id: string;
  spreadsheet_id: string;
  sheet_id: number;
  state: string;
}

const MAX_DRAFT_BYTES = 256 * 1024;

type Ctx = Context<OwnerEnv>;

async function ownedForm(c: Ctx, formId: string): Promise<FormRow | null> {
  return c.env.DB.prepare(
    "SELECT * FROM forms WHERE id = ? AND owner_id = ? AND status != 'archived'",
  )
    .bind(formId, c.var.user.id)
    .first<FormRow>();
}

async function destinationOf(c: Ctx, formId: string): Promise<DestinationRow | null> {
  return c.env.DB.prepare(
    "SELECT id, spreadsheet_id, sheet_id, state FROM destinations WHERE form_id = ?",
  )
    .bind(formId)
    .first<DestinationRow>();
}

function view(form: FormRow, destination: DestinationRow | null) {
  return {
    id: form.id,
    title: form.title,
    status: form.status,
    publishedVersion: form.published_version,
    updatedAt: form.updated_at,
    draft: JSON.parse(form.draft_json) as unknown,
    destination: destination && {
      state: destination.state,
      url: spreadsheetUrl(destination.spreadsheet_id, destination.sheet_id),
    },
  };
}

/** Google failures during publishing, as an owner-facing status. */
function googleFailure(c: Ctx, err: unknown) {
  if (!(err instanceof GoogleApiError)) throw err;
  if (err.kind === "ACCESS_REVOKED") return c.json({ error: "google_access_required" }, 409);
  if (err.kind === "SHEET_DELETED" || err.kind === "TAB_MISSING") {
    return c.json({ error: "destination_missing", kind: err.kind }, 409);
  }
  return c.json({ error: "google_unavailable", kind: err.kind }, 503);
}

export function formRoutes(deps: Deps): Hono<OwnerEnv> {
  const forms = new Hono<OwnerEnv>();
  forms.use(requireUser(deps));

  forms.get("/", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT id, title, status, published_version, updated_at FROM forms WHERE owner_id = ? AND status != 'archived' ORDER BY updated_at DESC",
    )
      .bind(c.var.user.id)
      .all<Omit<FormRow, "owner_id" | "draft_json">>();
    return c.json({
      forms: results.map((f) => ({
        id: f.id,
        title: f.title,
        status: f.status,
        publishedVersion: f.published_version,
        updatedAt: f.updated_at,
      })),
    });
  });

  forms.post("/", async (c) => {
    const body = await c.req.json<{ title?: unknown }>().catch(() => ({ title: undefined }));
    const title =
      typeof body.title === "string" && body.title.trim() !== ""
        ? body.title.trim()
        : "Untitled form";
    const id = newFormId();
    const draft: Form = { schemaVersion: 1, id, title: title.slice(0, 200), fields: [] };
    const now = deps.now();
    await c.env.DB.prepare(
      "INSERT INTO forms (id, owner_id, title, status, draft_json, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?, ?)",
    )
      .bind(id, c.var.user.id, draft.title, JSON.stringify(draft), now, now)
      .run();
    const form = await ownedForm(c, id);
    return c.json(form && view(form, null), 201);
  });

  forms.get("/:id", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    return c.json(view(form, await destinationOf(c, form.id)));
  });

  forms.put("/:id/draft", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    const text = await c.req.text();
    if (text.length > MAX_DRAFT_BYTES) return c.json({ error: "too_large" }, 413);
    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const parsed = parseForm(input);
    if (!parsed.success) return c.json({ error: "invalid_form", issues: parsed.issues }, 422);
    if (parsed.form.id !== form.id) return c.json({ error: "form_id_mismatch" }, 422);
    await c.env.DB.prepare(
      "UPDATE forms SET draft_json = ?, title = ?, updated_at = ? WHERE id = ?",
    )
      .bind(JSON.stringify(parsed.form), parsed.form.title, deps.now(), form.id)
      .run();
    const updated = await ownedForm(c, form.id);
    return c.json(updated && view(updated, await destinationOf(c, form.id)));
  });

  /**
   * Publishes the draft as a new immutable version and makes sure the response sheet has a column
   * for every field (creating the spreadsheet on first publish).
   */
  forms.post("/:id/publish", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    const parsed = parseForm(JSON.parse(form.draft_json));
    if (!parsed.success) return c.json({ error: "invalid_form", issues: parsed.issues }, 422);
    if (parsed.form.fields.length === 0) return c.json({ error: "no_fields" }, 422);

    let destination = await destinationOf(c, form.id);
    let created: { spreadsheetId: string; sheetId: number } | null = null;
    try {
      const sheets = await sheetsFor(c.env, deps, c.var.user.id);
      if (destination) {
        const dest = { spreadsheetId: destination.spreadsheet_id, sheetId: destination.sheet_id };
        await addMissingColumns(sheets, dest, parsed.form, await resolveColumns(sheets, dest));
      } else {
        created = await createResponseSpreadsheet(sheets, {
          title: `${parsed.form.title} (responses)`,
          form: parsed.form,
        });
      }
    } catch (err) {
      return googleFailure(c, err);
    }

    const now = deps.now();
    const version = (form.published_version ?? 0) + 1;
    const db = c.env.DB;
    const statements = [
      db
        .prepare(
          "INSERT INTO form_versions (form_id, version, schema_json, published_at) VALUES (?, ?, ?, ?)",
        )
        .bind(form.id, version, JSON.stringify(parsed.form), now),
      db
        .prepare(
          "UPDATE forms SET status = 'published', published_version = ?, updated_at = ? WHERE id = ?",
        )
        .bind(version, now, form.id),
    ];
    if (created) {
      statements.push(
        db
          .prepare(
            "INSERT INTO destinations (id, form_id, type, spreadsheet_id, sheet_id, state, last_ok_at, created_at, updated_at) VALUES (?, ?, 'google_sheet', ?, ?, 'OK', ?, ?, ?)",
          )
          .bind(newId("dst"), form.id, created.spreadsheetId, created.sheetId, now, now, now),
      );
    }
    await db.batch(statements);
    destination = await destinationOf(c, form.id);
    const updated = await ownedForm(c, form.id);
    return c.json(updated && view(updated, destination));
  });

  forms.get("/:id/deliveries", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    const { results } = await c.env.DB.prepare(
      "SELECT state, count(*) AS n, max(last_error_code) AS error FROM deliveries WHERE form_id = ? GROUP BY state",
    )
      .bind(form.id)
      .all<{ state: string; n: number; error: string | null }>();
    const destination = await destinationOf(c, form.id);
    return c.json({
      destination: destination && { state: destination.state },
      counts: Object.fromEntries(results.map((r) => [r.state, r.n])),
    });
  });

  /** After the owner fixes the destination, resume deliveries held for it (ADR 0011). */
  forms.post("/:id/deliveries/resume", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    const destination = await destinationOf(c, form.id);
    if (!destination) return c.json({ error: "no_destination" }, 409);
    const now = deps.now();
    await c.env.DB.prepare(
      "UPDATE destinations SET state = 'OK', last_error_code = NULL, updated_at = ? WHERE id = ?",
    )
      .bind(now, destination.id)
      .run();
    const resumed = await resumeHeld(c.env, destination.id);
    if (resumed.length > 0) {
      await c.env.DB.batch(
        resumed.map((id) =>
          c.env.DB.prepare(
            "UPDATE deliveries SET state = 'queued' WHERE submission_id = ? AND state = 'blocked'",
          ).bind(id),
        ),
      );
    }
    return c.json({ resumed: resumed.length });
  });

  forms.delete("/:id", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    await c.env.DB.prepare("UPDATE forms SET status = 'archived', updated_at = ? WHERE id = ?")
      .bind(deps.now(), form.id)
      .run();
    return c.body(null, 204);
  });

  return forms;
}
