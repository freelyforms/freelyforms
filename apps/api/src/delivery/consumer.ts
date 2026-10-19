import { decryptText } from "@freelyforms/crypto";
import type { AnswerValue } from "@freelyforms/form-engine";
import { parseForm, type Form } from "@freelyforms/form-schema";
import {
  addMissingColumns,
  appendRows,
  buildRow,
  existingSubmissionIds,
  GoogleApiError,
  driveClient,
  resolveColumns,
  sheetsClient,
  SYSTEM_COLUMNS,
  type Destination,
} from "@freelyforms/google";
import { defaultDeps, type DeliveryMessage, type Deps, type Env } from "../env.js";
import { accessTokenFor } from "../google-access.js";
import { attachFiles, fileCount } from "./files.js";
import { keyringFor } from "../keys.js";
import { hold, resumeStragglers } from "./hold.js";
import { deliverWebhook } from "./webhook.js";
import { maintainDomains } from "../domains/routes.js";
import { notifyForms, sweepNotifications } from "../notify/notify.js";

/** ADR 0008: transient errors are retried for up to 72 hours. */
export const TRANSIENT_RETRY_WINDOW_MS = 72 * 60 * 60 * 1000;
const MAX_DELAY_S = 6 * 60 * 60;
const HOUR_MS = 60 * 60 * 1000;
/** Upper bound of Google calls one form group needs (token, columns, tab size, header, reconcile, append). */
const CALLS_PER_GROUP = 6;

const numberVar = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Exponential backoff with jitter: 30 s, 60 s, 120 s … capped at 6 hours. */
export function backoffSeconds(attempts: number, random = Math.random): number {
  const base = Math.min(30 * 2 ** Math.max(0, attempts - 1), MAX_DELAY_S);
  return Math.round(base * (0.8 + 0.4 * random()));
}

interface Target {
  destinationId: string;
  ownerId: string;
  dest: Destination;
}

type Msg = Message<DeliveryMessage>;

async function setState(
  env: Env,
  ids: string[],
  state: string,
  extra: { error?: string; now?: number } = {},
) {
  if (ids.length === 0) return;
  const db = env.DB;
  await db.batch(
    ids.map((id) =>
      state === "delivered"
        ? db
            .prepare(
              "UPDATE deliveries SET state = 'delivered', delivered_at = ?, held_at = NULL, last_error_code = NULL WHERE submission_id = ?",
            )
            .bind(extra.now ?? 0, id)
        : db
            .prepare(
              "UPDATE deliveries SET state = ?, last_error_code = COALESCE(?, last_error_code) WHERE submission_id = ? AND state != 'delivered'",
            )
            .bind(state, extra.error ?? null, id),
    ),
  );
}

async function loadTarget(env: Env, formId: string): Promise<Target | null> {
  const row = await env.DB.prepare(
    `SELECT d.id, d.spreadsheet_id, d.sheet_id, f.owner_id FROM destinations d
     JOIN forms f ON f.id = d.form_id WHERE d.form_id = ?`,
  )
    .bind(formId)
    .first<{ id: string; spreadsheet_id: string; sheet_id: number; owner_id: string }>();
  return (
    row && {
      destinationId: row.id,
      ownerId: row.owner_id,
      dest: { spreadsheetId: row.spreadsheet_id, sheetId: row.sheet_id },
    }
  );
}

async function loadVersions(
  env: Env,
  formId: string,
  versions: Set<number>,
): Promise<Map<number, Form>> {
  const forms = new Map<number, Form>();
  for (const version of versions) {
    const row = await env.DB.prepare(
      "SELECT schema_json FROM form_versions WHERE form_id = ? AND version = ?",
    )
      .bind(formId, version)
      .first<{ schema_json: string }>();
    const parsed = row && parseForm(JSON.parse(row.schema_json));
    if (parsed?.success) forms.set(version, parsed.form);
  }
  return forms;
}

/** Delivers one form's messages from a batch: one append for all of them (ADR 0001). */
async function deliverGroup(
  env: Env,
  deps: Deps,
  formId: string,
  messages: Msg[],
  callsLeft: () => number = () => Number.POSITIVE_INFINITY,
): Promise<void> {
  const now = deps.now();
  // One query for the whole group (D1 limits queries per invocation).
  const { results: rows } = await env.DB.prepare(
    "SELECT submission_id, state, expires_at, attempts FROM deliveries WHERE submission_id IN (SELECT value FROM json_each(?))",
  )
    .bind(JSON.stringify(messages.map((m) => m.body.submissionId)))
    .all<{ submission_id: string; state: string; expires_at: number; attempts: number }>();
  const states = new Map(rows.map((r) => [r.submission_id, r]));
  // Already delivered, unknown to us (pruned) or a duplicate copy in this batch (Queues delivers
  // at least once; a resume can re-send): nothing to do.
  const seen = new Set<string>();
  const pending = messages.filter((m) => {
    const s = states.get(m.body.submissionId);
    const duplicate = seen.has(m.body.submissionId);
    seen.add(m.body.submissionId);
    if (!s || duplicate || s.state === "delivered" || s.state === "permanently_failed") {
      m.ack();
      return false;
    }
    return true;
  });
  if (pending.length === 0) return;

  const target = await loadTarget(env, formId);
  if (!target) {
    await setState(
      env,
      pending.map((m) => m.body.submissionId),
      "permanently_failed",
      { error: "NO_DESTINATION" },
    );
    for (const m of pending) m.ack();
    return;
  }

  const pendingIds = pending.map((m) => m.body.submissionId);
  await env.DB.batch(
    pendingIds.map((id) =>
      env.DB.prepare(
        "UPDATE deliveries SET state = 'delivering', attempts = attempts + 1, destination_id = ? WHERE submission_id = ?",
      ).bind(target.destinationId, id),
    ),
  );

  let appending = false;
  let toWrite = pending;
  try {
    const { token } = await accessTokenFor(env, deps, target.ownerId);
    const sheets = sheetsClient(deps.fetch, token);
    const drive = driveClient(deps.fetch, token);
    const forms = await loadVersions(env, formId, new Set(pending.map((m) => m.body.formVersion)));
    let columns = await resolveColumns(sheets, target.dest);
    if (!SYSTEM_COLUMNS.every((key) => columns.has(key))) {
      throw new GoogleApiError(
        columns.size === 0 ? "TAB_MISSING" : "COLUMN_MISSING",
        0,
        "system_column_missing",
      );
    }
    for (const form of forms.values())
      columns = await addMissingColumns(sheets, target.dest, form, columns);

    // ADR 0003/0013: any earlier attempt may have written the row (a lost response, a crash during
    // the append, or a later failure that overwrote the `unknown` state), so every retry reconciles
    // against the sheet first. First attempts, the common case, never read the sheet.
    if (pending.some((m) => (states.get(m.body.submissionId)?.attempts ?? 0) > 0)) {
      const present = await existingSubmissionIds(sheets, target.dest);
      const already = pending.filter((m) => present.has(m.body.submissionId));
      await setState(
        env,
        already.map((m) => m.body.submissionId),
        "delivered",
        { now },
      );
      for (const m of already) m.ack();
      toWrite = pending.filter((m) => !present.has(m.body.submissionId));
    }

    const keyring = await keyringFor(env);
    const rows = [];
    const deferred: Msg[] = [];
    for (const m of toWrite) {
      const form = forms.get(m.body.formVersion);
      if (!form) throw new GoogleApiError("INVALID_REQUEST", 0, "form_version_missing");
      const { values } = JSON.parse(
        await decryptText(keyring, m.body.payload, `submission:${m.body.submissionId}`),
      ) as { values: Record<string, AnswerValue> };
      // Each uploaded file costs two Drive calls (ADR 0007); responses that don't fit this
      // invocation's budget go back to the queue at once, like whole groups do.
      const files = fileCount(form, values);
      if (files > 0 && files * 2 + 1 > callsLeft()) {
        deferred.push(m);
        continue;
      }
      const checked = files > 0 ? await attachFiles(drive, form, values) : values;
      rows.push(buildRow(form, columns, { ...m.body, values: checked }));
    }
    for (const m of deferred) m.retry({ delaySeconds: 0 });
    toWrite = toWrite.filter((m) => !deferred.includes(m));
    if (rows.length === 0) return;
    appending = true;
    await appendRows(sheets, target.dest, rows);

    await setState(
      env,
      toWrite.map((m) => m.body.submissionId),
      "delivered",
      { now },
    );
    await env.DB.prepare(
      "UPDATE destinations SET state = 'OK', last_error_code = NULL, last_ok_at = ?, updated_at = ? WHERE id = ?",
    )
      .bind(now, now, target.destinationId)
      .run();
    for (const m of toWrite) m.ack();
  } catch (err) {
    const kind = err instanceof GoogleApiError ? err.kind : "INTERNAL";
    const retryable = !(err instanceof GoogleApiError) || err.retryable;
    if (retryable) {
      // A failed append may still have written the rows: reconcile before writing again.
      const state = appending ? "unknown" : "retrying";
      // ADR 0014: a retry the queue would drop (retention ends, one hour of margin) waits in the
      // hold store instead; the hourly sweep sends it back.
      const retentionMs = (numberVar(env.QUEUE_RETENTION_HOURS, 24) - 1) * HOUR_MS;
      for (const m of toWrite) {
        // Backoff follows real delivery attempts (the row), not queue redeliveries, which also
        // count budget requeues.
        const delaySeconds = backoffSeconds((states.get(m.body.submissionId)?.attempts ?? 0) + 1);
        if (now - m.body.submittedAt > TRANSIENT_RETRY_WINDOW_MS) {
          await setState(env, [m.body.submissionId], "permanently_failed", { error: kind });
          m.ack();
        } else if (now + delaySeconds * 1000 - m.timestamp.getTime() > retentionMs) {
          const expiresAt = states.get(m.body.submissionId)?.expires_at ?? 0;
          const held = await hold(env, target.destinationId, m.body, expiresAt, now);
          await setState(env, [m.body.submissionId], held ? state : "permanently_failed", {
            error: kind,
          });
          m.ack();
        } else {
          await setState(env, [m.body.submissionId], state, { error: kind });
          m.retry({ delaySeconds });
        }
      }
      if (!(err instanceof GoogleApiError))
        console.error("delivery_error", err instanceof Error ? err.name : "unknown");
      return;
    }
    // Owner-actionable (ADR 0005): park the payloads and surface the destination state.
    const destinationState = kind === "INVALID_REQUEST" ? null : kind;
    await env.DB.prepare(
      "UPDATE destinations SET state = COALESCE(?, state), last_error_code = ?, updated_at = ? WHERE id = ?",
    )
      .bind(destinationState, kind, now, target.destinationId)
      .run();
    for (const m of toWrite) {
      const expiresAt = states.get(m.body.submissionId)?.expires_at ?? 0;
      if (await hold(env, target.destinationId, m.body, expiresAt, now)) {
        await setState(env, [m.body.submissionId], "blocked", { error: kind });
      } else {
        await setState(env, [m.body.submissionId], "permanently_failed", { error: kind });
      }
      m.ack();
    }
  }
}

/** Queue consumer: groups the batch by form and delivers each group. */
export async function processBatch(
  batch: MessageBatch<DeliveryMessage>,
  env: Env,
  deps: Deps,
): Promise<void> {
  const groups = new Map<string, Msg[]>();
  const retentionMs = (numberVar(env.QUEUE_RETENTION_HOURS, 24) - 1) * HOUR_MS;
  for (const m of batch.messages) {
    // Webhook copies (ADR 0021) go out one by one and never touch the sheet's delivery state.
    if (m.body.webhookId) {
      await deliverWebhook(env, deps, m, (attempts) => {
        const delay = backoffSeconds(attempts);
        return deps.now() + delay * 1000 - m.timestamp.getTime() > retentionMs ? null : delay;
      });
      continue;
    }
    const list = groups.get(m.body.formId) ?? [];
    list.push(m);
    groups.set(m.body.formId, list);
  }
  // Stay inside the per-invocation subrequest limit: groups that would not fit go back to the
  // queue at once and are delivered by the next invocation.
  const budget = numberVar(env.GOOGLE_CALL_BUDGET, 40);
  let calls = 0;
  const counted: Deps = {
    ...deps,
    fetch: (input, init) => {
      calls += 1;
      return deps.fetch(input, init);
    },
  };
  for (const [formId, messages] of groups) {
    if (calls + CALLS_PER_GROUP > budget) {
      for (const m of messages) m.retry({ delaySeconds: 0 });
      continue;
    }
    await deliverGroup(env, counted, formId, messages, () => budget - calls);
  }
  // ADR 0026: owners who asked are told that responses arrived (after the sheet has them).
  await notifyForms(env, deps, [...groups.keys()]);
}

/**
 * Hourly maintenance: enforce the 7-day deadline in the database (KV expires held payloads by
 * itself), drop expired sessions, prune old delivery records (metadata only) and finish resumes
 * that a lagging KV listing or the chunk limit left behind.
 */
export async function maintenance(env: Env, now: number, deps: Deps = defaultDeps): Promise<void> {
  const db = env.DB;
  await db.batch([
    db
      .prepare(
        "UPDATE deliveries SET state = 'permanently_failed', held_at = NULL, last_error_code = COALESCE(last_error_code, 'EXPIRED') WHERE state NOT IN ('delivered', 'permanently_failed') AND expires_at <= ?",
      )
      .bind(now),
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db
      .prepare("DELETE FROM deliveries WHERE accepted_at <= ?")
      .bind(now - 30 * 24 * 60 * 60 * 1000),
  ]);
  await resumeStragglers(env);
  await cleanUploads(env, deps, now);
  await maintainDomains(env, deps, now);
  await sweepNotifications(env, { ...deps, now: () => now });
  await healthReport(env, now);
}

/** Upload folders visited per hourly run, and files deleted, to stay inside the call budget. */
const CLEANUP_FOLDERS = 5;
const CLEANUP_FILES = 20;

/**
 * Deletes files uploaded through a form but never sent with a response (ADR 0007): still marked
 * unattached a day after they were created, in folders used in the last two days.
 */
export async function cleanUploads(env: Env, deps: Deps, now: number): Promise<void> {
  const day = 24 * 60 * 60 * 1000;
  const { results } = await env.DB.prepare(
    `SELECT u.folder_id, f.owner_id FROM drive_folders u JOIN forms f ON f.id = u.form_id
     WHERE u.last_used_at > ? ORDER BY u.last_used_at DESC LIMIT ?`,
  )
    .bind(now - 2 * day, CLEANUP_FOLDERS)
    .all<{ folder_id: string; owner_id: string }>();
  let budget = CLEANUP_FILES;
  for (const { folder_id: folder, owner_id: owner } of results) {
    if (budget <= 0) break;
    try {
      const drive = driveClient(deps.fetch, (await accessTokenFor(env, deps, owner)).token);
      const stale = await drive.staleUploads(folder, new Date(now - day).toISOString());
      for (const id of stale.slice(0, budget)) {
        await drive.deleteFile(id);
        budget--;
      }
    } catch {
      // The owner's access is gone or Drive is down: try again next hour.
    }
  }
}

/** A delivery not finished this long after it was accepted, and not held for its owner, is stuck. */
export const STUCK_AFTER_MS = 60 * 60 * 1000;

/** Cloudflare for SaaS includes 100 custom hostnames; each one above costs money (ADR 0025). */
export const DOMAINS_ALERT_AT = 80;

/**
 * Hourly counts for operators, as one log line (no response content). `ops_alert` is logged at
 * error level when deliveries are stuck: that points at the service, not at an owner's sheet, so
 * an alert on it in Cloudflare's observability is worth waking up for. Held deliveries wait for
 * owners and failures are shown to them, so those two are reported but don't alert. Custom
 * domains alert in an hour when one was added with DOMAINS_ALERT_AT or more registered.
 */
export async function healthReport(env: Env, now: number) {
  const row = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN state NOT IN ('delivered', 'permanently_failed') AND held_at IS NULL
                         AND accepted_at <= ?1 THEN 1 ELSE 0 END), 0) AS stuck,
       COALESCE(SUM(CASE WHEN held_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS held,
       COALESCE(SUM(CASE WHEN state = 'permanently_failed' AND accepted_at > ?2 THEN 1 ELSE 0 END), 0) AS failedLastDay
     FROM deliveries`,
  )
    .bind(now - STUCK_AFTER_MS, now - 24 * 60 * 60 * 1000)
    .first<{ stuck: number; held: number; failedLastDay: number }>();
  const domains = await env.DB.prepare(
    "SELECT count(*) AS total, COALESCE(SUM(created_at > ?), 0) AS added FROM custom_domains",
  )
    .bind(now - 60 * 60 * 1000)
    .first<{ total: number; added: number }>();
  const report = {
    stuck: row?.stuck ?? 0,
    held: row?.held ?? 0,
    failedLastDay: row?.failedLastDay ?? 0,
    customDomains: domains?.total ?? 0,
  };
  const domainsNearLimit = report.customDomains >= DOMAINS_ALERT_AT && (domains?.added ?? 0) > 0;
  if (report.stuck > 0 || domainsNearLimit) console.error("ops_alert", JSON.stringify(report));
  else console.log("ops_health", JSON.stringify(report));
  return report;
}
