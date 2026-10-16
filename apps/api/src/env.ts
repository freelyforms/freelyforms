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
  /** Built web app (apps/web/dist), served under /app/. Absent in tests. */
  ASSETS?: Fetcher;
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
  /** Origin of the website and app, e.g. `https://freelyforms.com`; the bare forms domain redirects there. */
  APP_ORIGIN?: string;
  /** Where abuse reports go; every public form links to it (ADR 0010). */
  ABUSE_EMAIL?: string;
  /**
   * Google Picker (ADR 0006): a browser API key restricted to the Picker API and our origins, and
   * the Google Cloud project number (the Picker's app ID, which grants `drive.file` access to the
   * picked file). Both are public. Without them, attaching an existing sheet is unavailable.
   */
  PICKER_API_KEY?: string;
  GOOGLE_PROJECT_NUMBER?: string;
  /** Cloudflare Turnstile keys. When both are set, every public form requires a passed challenge. */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Submission rate limits (Workers Rate Limiting). Optional so self-hosted setups can omit them. */
  SUBMIT_IP_LIMITER?: RateLimit;
  SUBMIT_FORM_IP_LIMITER?: RateLimit;
  /**
   * How long the delivery queue keeps a message (24 on Workers Free, up to 336 on Paid). Retries
   * that would outlive it move to the hold store instead (ADR 0014). Default 24.
   */
  QUEUE_RETENTION_HOURS?: string;
  /** Google API calls one consumer invocation may make (Workers Free allows 50). Default 40. */
  GOOGLE_CALL_BUDGET?: string;
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
