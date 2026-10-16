import { parseForm, type Form } from "@freelyforms/form-schema";
import {
  addMissingColumns,
  addResponseTab,
  createResponseSpreadsheet,
  GoogleApiError,
  resolveColumns,
} from "@freelyforms/google";
import { Hono, type Context } from "hono";
import type { Deps } from "../env.js";
import { sheetsFor, spreadsheetUrl } from "../google-access.js";
import { requireUser, type OwnerEnv } from "../require-user.js";
import { resumeHeld } from "../delivery/hold.js";
import { embedSnippet } from "../public/embed.js";
import { formPageCsp } from "../public/protect.js";
import { renderForm, renderMessage } from "../public/render.js";
import { newFormId, newId, randomToken, readBodyLimited } from "../util.js";

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

/** Public URLs of a form: the forms domain in production, `/f/` on this origin in development. */
function publicLinks(c: Ctx, form: FormRow) {
  const base = c.env.FORMS_HOST ? `https://${c.env.FORMS_HOST}` : `${new URL(c.req.url).origin}/f`;
  const url = `${base}/${form.id}`;
  return {
    url,
    embedCode: embedSnippet(url, form.title, `${base}/embed.js`),
  };
}

/** The published definition, as stored (the draft is stored the same way, so strings compare). */
async function publishedJson(c: Ctx, form: FormRow): Promise<string | null> {
  if (form.published_version === null) return null;
  return c.env.DB.prepare("SELECT schema_json FROM form_versions WHERE form_id = ? AND version = ?")
    .bind(form.id, form.published_version)
    .first<string>("schema_json");
}

async function view(c: Ctx, form: FormRow, destination: DestinationRow | null) {
  const published = await publishedJson(c, form);
  return {
    id: form.id,
    title: form.title,
    status: form.status,
    publishedVersion: form.published_version,
    updatedAt: form.updated_at,
    draft: JSON.parse(form.draft_json) as unknown,
    hasUnpublishedChanges: published !== null && published !== form.draft_json,
    public: form.status === "published" ? publicLinks(c, form) : null,
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
    return c.json(form && (await view(c, form, null)), 201);
  });

  forms.get("/:id", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    return c.json(await view(c, form, await destinationOf(c, form.id)));
  });

  forms.put("/:id/draft", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    const bytes = await readBodyLimited(c.req.raw, MAX_DRAFT_BYTES);
    if (!bytes) return c.json({ error: "too_large" }, 413);
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(bytes));
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
    return c.json(updated && (await view(c, updated, await destinationOf(c, form.id))));
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
    // The version insert (primary key) and the destination insert (unique per form) make a
    // concurrent publish fail as a whole instead of creating a second version or destination.
    if (created) {
      statements.push(
        db
          .prepare(
            "INSERT INTO destinations (id, form_id, type, spreadsheet_id, sheet_id, state, last_ok_at, created_at, updated_at) VALUES (?, ?, 'google_sheet', ?, ?, 'OK', ?, ?, ?)",
          )
          .bind(newId("dst"), form.id, created.spreadsheetId, created.sheetId, now, now, now),
      );
    }
    try {
      await db.batch(statements);
    } catch {
      // A spreadsheet created by the losing request stays in the owner's Drive, unused.
      return c.json({ error: "publish_conflict" }, 409);
    }
    destination = await destinationOf(c, form.id);
    const updated = await ownedForm(c, form.id);
    return c.json(updated && (await view(c, updated, destination)));
  });

  /**
   * The draft rendered by the real public renderer, for the builder's preview frame. Same origin
   * as the builder; it can be framed only by it and never submits.
   */
  forms.get("/:id/preview", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    const nonce = randomToken(16);
    const parsed = parseForm(JSON.parse(form.draft_json));
    c.header("Cache-Control", "no-store");
    c.header("X-Robots-Tag", "noindex");
    c.header(
      "Content-Security-Policy",
      formPageCsp(nonce, false).replace("frame-ancestors *", "frame-ancestors 'self'"),
    );
    const page = { nonce, preview: true };
    if (!parsed.success) {
      return c.html(
        renderMessage(
          form.title,
          `The draft has ${String(parsed.issues.length)} problem(s) to fix before it can be previewed.`,
          page,
        ),
      );
    }
    return c.html(renderForm(parsed.form, "", page));
  });

  /**
   * Attaches a spreadsheet the owner picked with Google Picker (ADR 0006): a new responses tab is
   * added to it, so the owner's own tabs are never touched. Only before the form has a
   * destination; switching sheets later needs its own design (held deliveries, history).
   */
  forms.post("/:id/destination", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    const body = await c.req
      .json<{ spreadsheetId?: unknown }>()
      .catch(() => ({ spreadsheetId: undefined }));
    const spreadsheetId = body.spreadsheetId;
    if (typeof spreadsheetId !== "string" || !/^[A-Za-z0-9_-]{20,100}$/.test(spreadsheetId)) {
      return c.json({ error: "invalid_spreadsheet_id" }, 422);
    }
    if (await destinationOf(c, form.id)) return c.json({ error: "destination_exists" }, 409);
    const parsed = parseForm(JSON.parse(form.draft_json));
    const draft = parsed.success ? parsed.form : { title: form.title, fields: [] };
    let dest: { spreadsheetId: string; sheetId: number };
    try {
      dest = await addResponseTab(await sheetsFor(c.env, deps, c.var.user.id), spreadsheetId, {
        title: `${draft.title} responses`,
        form: draft,
      });
    } catch (err) {
      // drive.file: a file that was not picked through our Picker app ID is invisible (404).
      if (err instanceof GoogleApiError && err.kind === "SHEET_DELETED") {
        return c.json({ error: "sheet_not_accessible" }, 409);
      }
      return googleFailure(c, err);
    }
    const now = deps.now();
    try {
      await c.env.DB.prepare(
        "INSERT INTO destinations (id, form_id, type, spreadsheet_id, sheet_id, state, last_ok_at, created_at, updated_at) VALUES (?, ?, 'google_sheet', ?, ?, 'OK', ?, ?, ?)",
      )
        .bind(newId("dst"), form.id, dest.spreadsheetId, dest.sheetId, now, now, now)
        .run();
    } catch {
      return c.json({ error: "destination_exists" }, 409);
    }
    return c.json(await view(c, form, await destinationOf(c, form.id)));
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
    const { resumed, more } = await resumeHeld(c.env, destination.id);
    return c.json({ resumed: resumed.length, more });
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
