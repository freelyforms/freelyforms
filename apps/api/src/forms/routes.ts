import { decryptText, type Envelope } from "@freelyforms/crypto";
import { answerFields, parseForm, type Form } from "@freelyforms/form-schema";
import { MAX_TEXT_LENGTH } from "@freelyforms/form-schema/limits";
import {
  addMissingColumns,
  addResponseTab,
  deleteTab,
  createResponseSpreadsheet,
  GoogleApiError,
  readRows,
  resolveColumns,
  submissionIdColumn,
  syncHeaders,
  SYSTEM_COLUMNS,
  writeCell,
} from "@freelyforms/google";
import { Hono, type Context } from "hono";
import type { Deps } from "../env.js";
import { sheetsFor, spreadsheetUrl } from "../google-access.js";
import { keyringFor } from "../keys.js";
import { requireUser, type OwnerEnv } from "../require-user.js";
import { resumeHeld } from "../delivery/hold.js";
import { embedSnippet } from "../public/embed.js";
import { templateBySlug } from "../site/templates.js";
import { formPageCsp } from "../public/protect.js";
import { renderForm, renderMessage } from "../public/render.js";
import { newFormId, newId, randomToken, readBodyLimited } from "../util.js";
import {
  newSecret,
  newWebhookId,
  post as postWebhook,
  sampleValues,
  webhookBody,
  webhookUrlProblem,
} from "../delivery/webhook.js";

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
/** Responses per page in the responses view (ADR 0024). */
const RESPONSES_PAGE = 50;

type Ctx = Context<OwnerEnv>;

type Role = "owner" | "editor" | "viewer";
type Need = "view" | "edit" | "own";
const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };
const NEEDED: Record<Need, number> = { view: 1, edit: 2, own: 3 };

/**
 * The form if the signed-in user may do `need` with it (ADR 0024): the owner may do anything,
 * an editor may view and edit, a viewer may view. Anyone else gets null, as if it didn't exist.
 */
async function formFor(
  c: Ctx,
  formId: string,
  need: Need,
): Promise<(FormRow & { role: Role }) | null> {
  const form = await c.env.DB.prepare("SELECT * FROM forms WHERE id = ? AND status != 'archived'")
    .bind(formId)
    .first<FormRow>();
  if (!form) return null;
  const role: Role | null =
    form.owner_id === c.var.user.id
      ? "owner"
      : await c.env.DB.prepare("SELECT role FROM form_members WHERE form_id = ? AND email = ?")
          .bind(formId, c.var.user.email.toLowerCase())
          .first<"viewer" | "editor">("role");
  return role && RANK[role] >= NEEDED[need] ? { ...form, role } : null;
}

const ownedForm = (c: Ctx, formId: string) => formFor(c, formId, "own");

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

async function view(c: Ctx, form: FormRow & { role?: Role }, destination: DestinationRow | null) {
  const published = await publishedJson(c, form);
  return {
    id: form.id,
    /** What the signed-in user may do with this form (ADR 0024). */
    role: form.role ?? "owner",
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

/**
 * Stores a new draft form for the signed-in owner, in the schema's own key order (as saved drafts
 * and published versions are, so an unchanged draft compares equal to its first published version).
 */
async function insertDraft(c: Ctx, now: number, candidate: Form) {
  const parsed = parseForm(candidate);
  const draft = parsed.success ? parsed.form : candidate;
  await c.env.DB.prepare(
    "INSERT INTO forms (id, owner_id, title, status, draft_json, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?, ?)",
  )
    .bind(draft.id, c.var.user.id, draft.title, JSON.stringify(draft), now, now)
    .run();
  const form = await ownedForm(c, draft.id);
  return c.json(form && (await view(c, form, null)), 201);
}

interface WebhookRow {
  id: string;
  url: string;
  secret: string;
  failing: number;
  last_status: number | null;
  last_attempt_at: number | null;
  last_ok_at: number | null;
}

const webhookRow = (c: Ctx, formId: string) =>
  c.env.DB.prepare(
    "SELECT id, url, secret, failing, last_status, last_attempt_at, last_ok_at FROM webhooks WHERE form_id = ?",
  )
    .bind(formId)
    .first<WebhookRow>();

/** What the owner sees of a webhook: never the secret. */
const webhookView = (row: WebhookRow | null) =>
  row && {
    url: row.url,
    failing: row.failing === 1,
    lastStatus: row.last_status,
    lastAttemptAt: row.last_attempt_at,
    lastOkAt: row.last_ok_at,
  };

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
      `SELECT f.id, f.title, f.status, f.published_version, f.updated_at,
         d.state AS destination_state,
         (SELECT count(*) FROM deliveries x WHERE x.form_id = f.id
            AND (x.state = 'blocked' OR (x.state = 'permanently_failed' AND x.accepted_at > ?1))) AS blocked,
         CASE WHEN f.owner_id = ?2 THEN 'owner' ELSE m.role END AS role
       FROM forms f LEFT JOIN destinations d ON d.form_id = f.id
       LEFT JOIN form_members m ON m.form_id = f.id AND m.email = ?3
       WHERE (f.owner_id = ?2 OR m.email IS NOT NULL) AND f.status != 'archived'
       ORDER BY f.updated_at DESC`,
    )
      // Responses that could not be delivered in the last 7 days also need the owner's attention.
      // Forms shared with the user (ADR 0024) are listed with their role.
      .bind(deps.now() - 7 * 24 * 60 * 60 * 1000, c.var.user.id, c.var.user.email.toLowerCase())
      .all<
        Omit<FormRow, "owner_id" | "draft_json"> & {
          destination_state: string | null;
          blocked: number;
          role: Role;
        }
      >();
    return c.json({
      forms: results.map((f) => ({
        id: f.id,
        title: f.title,
        status: f.status,
        publishedVersion: f.published_version,
        updatedAt: f.updated_at,
        role: f.role,
        // Something the owner must fix: the sheet is unreachable or responses are waiting.
        needsAttention:
          (f.destination_state !== null &&
            f.destination_state !== "OK" &&
            f.destination_state !== "QUOTA") ||
          f.blocked > 0,
      })),
    });
  });

  /** Creates an empty draft, or a copy of a website template (`{ template: "<slug>" }`). */
  forms.post("/", async (c) => {
    const body = await c.req
      .json<{ title?: unknown; template?: unknown }>()
      .catch(() => ({ title: undefined, template: undefined }));
    const template = typeof body.template === "string" ? templateBySlug(body.template) : undefined;
    if (body.template !== undefined && !template) return c.json({ error: "unknown_template" }, 422);
    const title =
      typeof body.title === "string" && body.title.trim() !== ""
        ? body.title.trim()
        : (template?.form.title ?? "Untitled form");
    const id = newFormId();
    const candidate: Form = template
      ? { ...structuredClone(template.form), id, title: title.slice(0, 200) }
      : { schemaVersion: 1, id, title: title.slice(0, 200), fields: [] };
    return insertDraft(c, deps.now(), candidate);
  });

  /**
   * Copies a form's current draft into a new draft form: same fields and settings, a fresh ID,
   * no spreadsheet (its first publish creates one) and no responses.
   */
  forms.post("/:id/duplicate", async (c) => {
    const source = await formFor(c, c.req.param("id"), "view");
    if (!source) return c.json({ error: "not_found" }, 404);
    const id = newFormId();
    const title = `${source.title} (copy)`.slice(0, 200);
    return insertDraft(c, deps.now(), { ...(JSON.parse(source.draft_json) as Form), id, title });
  });

  /**
   * Creates a draft from an exported form definition (forms are portable as JSON). The form gets a
   * fresh ID; field and option IDs are kept, so conditions keep working. No spreadsheet yet.
   */
  forms.post("/import", async (c) => {
    const bytes = await readBodyLimited(c.req.raw, MAX_DRAFT_BYTES);
    if (!bytes) return c.json({ error: "too_large" }, 413);
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return c.json(
        { error: "invalid_form", issues: [{ path: "", message: "Expected a form object" }] },
        422,
      );
    }
    const parsed = parseForm({ ...input, id: newFormId() });
    if (!parsed.success) return c.json({ error: "invalid_form", issues: parsed.issues }, 422);
    return insertDraft(c, deps.now(), parsed.form);
  });

  forms.get("/:id", async (c) => {
    const form = await formFor(c, c.req.param("id"), "view");
    if (!form) return c.json({ error: "not_found" }, 404);
    return c.json(await view(c, form, await destinationOf(c, form.id)));
  });

  forms.put("/:id/draft", async (c) => {
    const form = await formFor(c, c.req.param("id"), "edit");
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
    const updated = await formFor(c, form.id, "view");
    return c.json(updated && (await view(c, updated, await destinationOf(c, form.id))));
  });

  /**
   * Publishes the draft as a new immutable version and makes sure the response sheet has a column
   * for every field (creating the spreadsheet on first publish).
   */
  forms.post("/:id/publish", async (c) => {
    const form = await formFor(c, c.req.param("id"), "edit");
    if (!form) return c.json({ error: "not_found" }, 404);
    const parsed = parseForm(JSON.parse(form.draft_json));
    if (!parsed.success) return c.json({ error: "invalid_form", issues: parsed.issues }, 422);
    if (parsed.form.fields.length === 0) return c.json({ error: "no_fields" }, 422);

    let destination = await destinationOf(c, form.id);
    let created: { spreadsheetId: string; sheetId: number } | null = null;
    try {
      // Always as the owner: an editor publishing uses the owner's Google access (ADR 0024).
      const sheets = await sheetsFor(c.env, deps, form.owner_id);
      if (destination) {
        const dest = { spreadsheetId: destination.spreadsheet_id, sheetId: destination.sheet_id };
        const columns = await addMissingColumns(
          sheets,
          dest,
          parsed.form,
          await resolveColumns(sheets, dest),
        );
        const previous = await publishedJson(c, form);
        const before = previous ? parseForm(JSON.parse(previous)) : null;
        if (before?.success) await syncHeaders(sheets, dest, parsed.form, before.form, columns);
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
    const updated = await formFor(c, form.id, "view");
    return c.json(updated && (await view(c, updated, destination)));
  });

  /**
   * The draft rendered by the real public renderer, for the builder's preview frame. Same origin
   * as the builder; it can be framed only by it and never submits.
   */
  forms.get("/:id/preview", async (c) => {
    const form = await formFor(c, c.req.param("id"), "view");
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
    let sheets: Awaited<ReturnType<typeof sheetsFor>>;
    try {
      sheets = await sheetsFor(c.env, deps, c.var.user.id);
      dest = await addResponseTab(sheets, spreadsheetId, {
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
      await deleteTab(sheets, dest); // a concurrent publish or attach won
      return c.json({ error: "destination_exists" }, 409);
    }
    return c.json(await view(c, form, await destinationOf(c, form.id)));
  });

  forms.get("/:id/deliveries", async (c) => {
    const form = await formFor(c, c.req.param("id"), "view");
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
    const form = await formFor(c, c.req.param("id"), "edit");
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

  // Members (ADR 0024): only the owner sees and changes who else has access.
  forms.get("/:id/members", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    const { results } = await c.env.DB.prepare(
      "SELECT email, role FROM form_members WHERE form_id = ? ORDER BY created_at, rowid",
    )
      .bind(form.id)
      .all<{ email: string; role: "viewer" | "editor" }>();
    return c.json({ members: results });
  });

  forms.put("/:id/members", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    const body = await c.req
      .json<{ email?: unknown; role?: unknown }>()
      .catch(() => ({ email: undefined, role: undefined }));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return c.json({ error: "invalid_email" }, 422);
    }
    if (body.role !== "viewer" && body.role !== "editor") {
      return c.json({ error: "invalid_role" }, 422);
    }
    if (email === c.var.user.email.toLowerCase()) return c.json({ error: "is_owner" }, 422);
    await c.env.DB.prepare(
      `INSERT INTO form_members (form_id, email, role, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (form_id, email) DO UPDATE SET role = excluded.role`,
    )
      .bind(form.id, email, body.role, deps.now())
      .run();
    return c.json({ email, role: body.role });
  });

  forms.delete("/:id/members/:email", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    await c.env.DB.prepare("DELETE FROM form_members WHERE form_id = ? AND email = ?")
      .bind(form.id, decodeURIComponent(c.req.param("email")).toLowerCase())
      .run();
    return c.body(null, 204);
  });

  /**
   * A page of responses, newest first (ADR 0024), read from the owner's sheet now and never
   * stored. Columns are matched to fields by their identities (ADR 0004).
   */
  forms.get("/:id/responses", async (c) => {
    const form = await formFor(c, c.req.param("id"), "view");
    if (!form) return c.json({ error: "not_found" }, 404);
    const destination = await destinationOf(c, form.id);
    if (!destination) return c.json({ columns: [], rows: [], total: 0, page: 1, pages: 0 });
    c.header("Cache-Control", "no-store");
    const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);
    try {
      const sheets = await sheetsFor(c.env, deps, form.owner_id);
      const dest = { spreadsheetId: destination.spreadsheet_id, sheetId: destination.sheet_id };
      const columns = await resolveColumns(sheets, dest);
      const ids = await submissionIdColumn(sheets, dest);
      // Row indexes of responses, newest (bottom) first.
      const responseRows = ids
        .map((id, row) => ({ id, row }))
        .filter((r) => r.row > 0 && r.id !== "")
        .reverse();
      const total = responseRows.length;
      const slice = responseRows.slice((page - 1) * RESPONSES_PAGE, page * RESPONSES_PAGE);
      const first = Math.min(...slice.map((r) => r.row));
      const last = Math.max(...slice.map((r) => r.row));
      const values = slice.length ? await readRows(sheets, dest, first, last + 1) : [];
      const parsed = parseForm(JSON.parse(form.draft_json));
      const fields = parsed.success ? answerFields(parsed.form) : [];
      const known = [...SYSTEM_COLUMNS, ...fields.map((f) => f.id)].filter((k) => columns.has(k));
      return c.json({
        columns: known.map((key) => ({
          key,
          label: fields.find((f) => f.id === key)?.label ?? key,
          editable: !key.startsWith("_"),
        })),
        rows: slice.map(({ id, row }) => {
          const cells = values[row - first] ?? [];
          return {
            submissionId: id,
            cells: Object.fromEntries(known.map((k) => [k, cells[columns.get(k) ?? -1] ?? ""])),
          };
        }),
        total,
        page,
        pages: Math.ceil(total / RESPONSES_PAGE),
      });
    } catch (err) {
      return googleFailure(c, err);
    }
  });

  /** Corrects one answer in the owner's sheet (editors and the owner; ADR 0024). */
  forms.patch("/:id/responses/:submissionId", async (c) => {
    const form = await formFor(c, c.req.param("id"), "edit");
    if (!form) return c.json({ error: "not_found" }, 404);
    const destination = await destinationOf(c, form.id);
    if (!destination) return c.json({ error: "no_destination" }, 409);
    const body = await c.req
      .json<{ key?: unknown; value?: unknown }>()
      .catch(() => ({ key: undefined, value: undefined }));
    const key = typeof body.key === "string" ? body.key : "";
    const value = typeof body.value === "string" ? body.value.slice(0, MAX_TEXT_LENGTH) : null;
    if (key.startsWith("_") || value === null) return c.json({ error: "invalid_edit" }, 422);
    try {
      const sheets = await sheetsFor(c.env, deps, form.owner_id);
      const dest = { spreadsheetId: destination.spreadsheet_id, sheetId: destination.sheet_id };
      const column = (await resolveColumns(sheets, dest)).get(key);
      const row = (await submissionIdColumn(sheets, dest)).indexOf(c.req.param("submissionId"));
      if (column === undefined || row < 1) return c.json({ error: "not_found" }, 404);
      const numeric = /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : null;
      await writeCell(sheets, dest, row, column, numeric ?? value);
      return c.json({ ok: true });
    } catch (err) {
      return googleFailure(c, err);
    }
  });

  // Webhook destination (ADR 0021): the secret is shown only when created or rotated.
  forms.get("/:id/webhook", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    return c.json({ webhook: webhookView(await webhookRow(c, form.id)) });
  });

  forms.put("/:id/webhook", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    const body = await c.req.json<{ url?: unknown }>().catch(() => ({ url: undefined }));
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const problem = webhookUrlProblem(url);
    if (problem) return c.json({ error: "invalid_webhook_url", reason: problem }, 422);
    const now = deps.now();
    const existing = await webhookRow(c, form.id);
    if (existing) {
      await c.env.DB.prepare(
        "UPDATE webhooks SET url = ?, failing = 0, updated_at = ? WHERE id = ?",
      )
        .bind(url, now, existing.id)
        .run();
      return c.json({ webhook: webhookView(await webhookRow(c, form.id)) });
    }
    const id = newWebhookId();
    const { secret, stored } = await newSecret(c.env, id);
    await c.env.DB.prepare(
      "INSERT INTO webhooks (id, form_id, url, secret, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(id, form.id, url, stored, now, now)
      .run();
    return c.json({ webhook: webhookView(await webhookRow(c, form.id)), secret }, 201);
  });

  forms.post("/:id/webhook/rotate", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    const existing = await webhookRow(c, form.id);
    if (!existing) return c.json({ error: "no_webhook" }, 409);
    const { secret, stored } = await newSecret(c.env, existing.id);
    await c.env.DB.prepare("UPDATE webhooks SET secret = ?, updated_at = ? WHERE id = ?")
      .bind(stored, deps.now(), existing.id)
      .run();
    return c.json({ secret });
  });

  /** Posts a sample body (`"test": true`) now and reports the receiver's HTTP status. */
  forms.post("/:id/webhook/test", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    const existing = await webhookRow(c, form.id);
    if (!existing) return c.json({ error: "no_webhook" }, 409);
    const parsed = parseForm(JSON.parse(form.draft_json));
    if (!parsed.success) return c.json({ error: "invalid_form", issues: parsed.issues }, 422);
    const secret = await decryptText(
      await keyringFor(c.env),
      JSON.parse(existing.secret) as Envelope,
      `webhook:${existing.id}`,
    );
    const now = deps.now();
    const sample = {
      submissionId: "TEST",
      formId: form.id,
      formVersion: form.published_version ?? 0,
      submittedAt: now,
    };
    const status = await postWebhook(
      deps,
      { url: existing.url, secret },
      webhookBody(parsed.form, sample, sampleValues(parsed.form), true),
      "TEST",
    );
    return c.json({ status, ok: status >= 200 && status < 300 });
  });

  forms.delete("/:id/webhook", async (c) => {
    const form = await ownedForm(c, c.req.param("id"));
    if (!form) return c.json({ error: "not_found" }, 404);
    await c.env.DB.prepare("DELETE FROM webhooks WHERE form_id = ?").bind(form.id).run();
    return c.body(null, 204);
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
