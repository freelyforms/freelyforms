import type { Envelope } from "@freelyforms/crypto";

/** Queue message for one accepted submission. Answers travel only inside the encrypted envelope. */
export interface DeliveryMessage {
  submissionId: string;
  formId: string;
  formVersion: number;
  submittedAt: number;
  /** Encrypted `{ values }`, bound to `submission:<submissionId>`. */
  payload: Envelope;
}

export interface Env {
  DB: D1Database;
  /** Delivery queue (ADR 0001, ADR 0008). */
  DELIVERY_QUEUE: Queue<DeliveryMessage>;
  /** Hold store for blocked deliveries (ADR 0011). */
  HOLD: KVNamespace;
  /** OAuth client of the Google Cloud project for this environment. */
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** Current master key for envelope encryption (32 bytes, base64url). */
  MASTER_KEY_K1: string;
  /** Host that serves public forms (ADR 0010), e.g. `freelyforms.link`. Unset in development. */
  FORMS_HOST?: string;
  /** Cloudflare Turnstile keys. When both are set, every public form requires a passed challenge. */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Submission rate limits (Workers Rate Limiting). Optional so self-hosted setups can omit them. */
  SUBMIT_IP_LIMITER?: RateLimit;
  SUBMIT_FORM_IP_LIMITER?: RateLimit;
}

/** External effects, injectable for tests. */
export interface Deps {
  fetch: typeof fetch;
  now: () => number;
}

export const defaultDeps: Deps = {
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
};
