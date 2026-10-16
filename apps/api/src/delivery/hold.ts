import type { DeliveryMessage, Env } from "../env.js";

/** KV requires expirations at least 60 seconds in the future. */
const MIN_TTL_MS = 60_000;

export const holdKey = (destinationId: string, submissionId: string) =>
  `hold:${destinationId}:${submissionId}`;

/**
 * Parks an encrypted delivery in the hold store (ADR 0011, ADR 0014) and marks the row `held_at`.
 * KV deletes it at `expiresAt` even if nothing else runs. Returns false when the deadline is too
 * close to hold.
 */
export async function hold(
  env: Env,
  destinationId: string,
  message: DeliveryMessage,
  expiresAt: number,
  now: number,
): Promise<boolean> {
  if (expiresAt - now < MIN_TTL_MS) return false;
  // Mark first: a resume running meanwhile then sees the new mark and keeps the key it finds.
  await env.DB.prepare("UPDATE deliveries SET held_at = ? WHERE submission_id = ?")
    .bind(now, message.submissionId)
    .run();
  await env.HOLD.put(holdKey(destinationId, message.submissionId), JSON.stringify(message), {
    expiration: Math.floor(expiresAt / 1000),
  });
  return true;
}

/** Held deliveries resumed per call, to stay well inside the per-invocation limits. */
export const RESUME_CHUNK = 100;

/**
 * Moves held deliveries of a destination back to the queue, at most `limit` per call.
 *
 * Order per key: send, then clear the row's mark (only if it is still the hold we read), then
 * delete the key. A crash after sending leaves the key and the mark, so the delivery is sent
 * again later; the consumer reconciles retries, so a second copy never writes a second row. If
 * the consumer parked the delivery again meanwhile (a newer `held_at`), the newer key is kept.
 * `more` is true when keys may remain (call again; the hourly sweep also does).
 */
export async function resumeHeld(
  env: Env,
  destinationId: string,
  limit = RESUME_CHUNK,
): Promise<{ resumed: string[]; more: boolean }> {
  const resumed: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.HOLD.list({
      prefix: `hold:${destinationId}:`,
      limit: Math.min(limit - resumed.length, 1000),
      ...(cursor ? { cursor } : {}),
    });
    for (const { name } of page.keys) {
      const value = await env.HOLD.get(name);
      if (value === null) continue; // expired between list and get
      const message = JSON.parse(value) as DeliveryMessage;
      const row = await env.DB.prepare("SELECT held_at FROM deliveries WHERE submission_id = ?")
        .bind(message.submissionId)
        .first<{ held_at: number | null }>();
      // No row: pruned or the account was deleted. No mark: an earlier resume already sent it
      // and stopped before deleting the key. Either way the key is only a leftover copy.
      if (row?.held_at == null) {
        await env.HOLD.delete(name);
        continue;
      }
      await env.DELIVERY_QUEUE.send(message, { contentType: "json" });
      const { meta } = await env.DB.prepare(
        "UPDATE deliveries SET state = 'queued', held_at = NULL WHERE submission_id = ? AND held_at = ? AND state IN ('blocked', 'retrying', 'unknown', 'queued')",
      )
        .bind(message.submissionId, row.held_at)
        .run();
      if (meta.changes > 0) {
        await env.HOLD.delete(name);
      } else {
        // Delivered or failed meanwhile (the consumer clears the mark): the key is a leftover.
        const now = await env.DB.prepare("SELECT state FROM deliveries WHERE submission_id = ?")
          .bind(message.submissionId)
          .first<{ state: string }>();
        if (!now || now.state === "delivered" || now.state === "permanently_failed")
          await env.HOLD.delete(name);
      }
      resumed.push(message.submissionId);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && resumed.length < limit);
  return { resumed, more: cursor !== undefined };
}

/** Held deliveries the hourly sweep resumes in one run, across all destinations. */
export const SWEEP_LIMIT = 100;

/**
 * Hourly sweep: resumes held deliveries of destinations that are OK, oldest hold first, so no
 * destination starves. Covers resumes a lagging KV listing or a chunk limit left behind, and
 * transient retries parked because the queue would have dropped them (ADR 0014).
 */
export async function resumeStragglers(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT x.destination_id AS id, MIN(x.held_at) AS oldest FROM deliveries x
     JOIN destinations d ON d.id = x.destination_id
     WHERE x.held_at IS NOT NULL AND d.state = 'OK'
     GROUP BY x.destination_id ORDER BY oldest LIMIT 10`,
  ).all<{ id: string }>();
  let budget = SWEEP_LIMIT;
  for (const { id } of results) {
    if (budget <= 0) break;
    const { resumed } = await resumeHeld(env, id, budget);
    budget -= Math.max(resumed.length, 1);
  }
}
