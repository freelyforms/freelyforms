import type { DeliveryMessage } from "../src/env.js";

/** In-memory queue producer that records sent messages. */
export function fakeQueue() {
  const sent: DeliveryMessage[] = [];
  const queue = {
    send: (message: DeliveryMessage) => {
      sent.push(structuredClone(message));
      return Promise.resolve({ metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } });
    },
  } as unknown as Queue<DeliveryMessage>;
  return { queue, sent };
}

/** In-memory KV with expirations (enough of the API for the hold store). */
export function fakeKv(now: () => number) {
  const store = new Map<string, { value: string; expiration?: number }>();
  const live = (k: string) => {
    const e = store.get(k);
    if (e?.expiration !== undefined && e.expiration * 1000 <= now()) store.delete(k);
    return store.get(k);
  };
  const kv = {
    put: (k: string, value: string, opts?: { expiration?: number }) => {
      store.set(
        k,
        opts?.expiration === undefined ? { value } : { value, expiration: opts.expiration },
      );
      return Promise.resolve();
    },
    get: (k: string) => Promise.resolve(live(k)?.value ?? null),
    delete: (k: string) => {
      store.delete(k);
      return Promise.resolve();
    },
    list: (opts: { prefix?: string; limit?: number; cursor?: string }) => {
      const all = [...store.keys()].filter((k) => k.startsWith(opts.prefix ?? "") && live(k));
      const from = Number(opts.cursor ?? "0");
      const to = from + (opts.limit ?? 1000);
      const done = to >= all.length;
      return Promise.resolve({
        keys: all.slice(from, to).map((name) => ({ name })),
        list_complete: done,
        ...(done ? {} : { cursor: String(to) }),
        cacheStatus: null,
      });
    },
  } as unknown as KVNamespace;
  return { kv, store };
}

/** A queue message as the consumer receives it. */
export function message(body: DeliveryMessage, attempts = 1) {
  const outcome: { acked: boolean; retryDelay?: number } = { acked: false };
  const m = {
    id: body.submissionId,
    timestamp: new Date(body.submittedAt),
    body,
    attempts,
    ack: () => {
      outcome.acked = true;
    },
    retry: (opts?: { delaySeconds?: number }) => {
      outcome.retryDelay = opts?.delaySeconds ?? 0;
    },
  } as unknown as Message<DeliveryMessage>;
  return { m, outcome };
}
