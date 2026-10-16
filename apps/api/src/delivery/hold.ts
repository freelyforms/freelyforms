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

/** Moves every held delivery of a destination back to the queue. Returns how many were resumed. */
export async function resumeHeld(env: Env, destinationId: string): Promise<string[]> {
  const resumed: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.HOLD.list({
      prefix: `hold:${destinationId}:`,
      ...(cursor ? { cursor } : {}),
    });
    for (const { name } of page.keys) {
      const value = await env.HOLD.get(name);
      if (value === null) continue; // expired between list and get
      const message = JSON.parse(value) as DeliveryMessage;
      await env.DELIVERY_QUEUE.send(message, { contentType: "json" });
      await env.HOLD.delete(name);
      resumed.push(message.submissionId);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return resumed;
}
