import type { DeliveryMessage, Env } from "../env.js";

/** KV requires expirations at least 60 seconds in the future. */
const MIN_TTL_MS = 60_000;

const key = (destinationId: string, submissionId: string) =>
  `hold:${destinationId}:${submissionId}`;

/**
 * Parks an encrypted delivery until the owner fixes the destination (ADR 0011). KV deletes it at
 * `expiresAt` even if nothing else runs. Returns false when the deadline is too close to hold.
 */
export async function hold(
  env: Env,
  destinationId: string,
  message: DeliveryMessage,
  expiresAt: number,
  now: number,
): Promise<boolean> {
  if (expiresAt - now < MIN_TTL_MS) return false;
  await env.HOLD.put(key(destinationId, message.submissionId), JSON.stringify(message), {
    expiration: Math.floor(expiresAt / 1000),
  });
  return true;
}

/** Held deliveries resumed per call, to stay well inside the per-invocation subrequest limit. */
export const RESUME_CHUNK = 100;

/**
 * Moves held deliveries of a destination back to the queue, at most `limit` per call. The
 * delivery row is marked `queued` before the message is sent, so the consumer can never overwrite
 * a newer state with ours; if sending fails the row goes back to `blocked` and the key stays.
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
      const setState = (from: string, to: string) =>
        env.DB.prepare("UPDATE deliveries SET state = ? WHERE submission_id = ? AND state = ?")
          .bind(to, message.submissionId, from)
          .run();
      await setState("blocked", "queued");
      try {
        await env.DELIVERY_QUEUE.send(message, { contentType: "json" });
      } catch (err) {
        await setState("queued", "blocked");
        throw err;
      }
      await env.HOLD.delete(name);
      resumed.push(message.submissionId);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && resumed.length < limit);
  return { resumed, more: cursor !== undefined };
}

/**
 * Hourly sweep: destinations that are OK again but still have blocked deliveries (KV listings can
 * lag right after a fix, or a resume stopped at its chunk limit) get another resume.
 */
export async function resumeStragglers(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT d.id FROM destinations d JOIN deliveries x ON x.destination_id = d.id
     WHERE d.state = 'OK' AND x.state = 'blocked' LIMIT 20`,
  ).all<{ id: string }>();
  for (const { id } of results) await resumeHeld(env, id);
}
