export interface Env {
  DB: D1Database;
  /** OAuth client of the Google Cloud project for this environment. */
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** Current master key for envelope encryption (32 bytes, base64url). */
  MASTER_KEY_K1: string;
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
