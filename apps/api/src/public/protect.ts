import type { Deps, Env } from "../env.js";

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";
/** Field the Turnstile widget adds to the form. */
export const TURNSTILE_FIELD = "cf-turnstile-response";

export const turnstileEnabled = (
  env: Env,
): env is Env & { TURNSTILE_SITE_KEY: string; TURNSTILE_SECRET_KEY: string } =>
  Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);

/** Verifies a Turnstile token server-side. Network or Cloudflare errors count as failure. */
export async function verifyTurnstile(
  env: Env,
  deps: Deps,
  token: unknown,
  remoteIp: string | undefined,
): Promise<boolean> {
  if (!turnstileEnabled(env)) return true;
  if (typeof token !== "string" || token === "" || token.length > 2048) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  try {
    const res = await deps.fetch(TURNSTILE_VERIFY_URL, { method: "POST", body });
    if (!res.ok) return false;
    const result = await res.json<{ success?: unknown }>();
    return result.success === true;
  } catch {
    return false;
  }
}

/**
 * Per-IP and per-IP-per-form submission limits. Limits are approximate by design (Workers Rate
 * Limiting is eventually consistent); they stop floods, not determined attackers.
 */
export async function withinRateLimits(
  env: Env,
  formId: string,
  ip: string | undefined,
): Promise<boolean> {
  const who = ip ?? "unknown";
  const checks: Promise<RateLimitOutcome>[] = [];
  if (env.SUBMIT_IP_LIMITER) checks.push(env.SUBMIT_IP_LIMITER.limit({ key: who }));
  if (env.SUBMIT_FORM_IP_LIMITER) {
    checks.push(env.SUBMIT_FORM_IP_LIMITER.limit({ key: `${formId}:${who}` }));
  }
  const outcomes = await Promise.all(checks);
  return outcomes.every((o) => o.success);
}

/** CSP for a public form page. Forms may be embedded anywhere, so framing is allowed. */
export function formPageCsp(nonce: string, turnstile: boolean): string {
  return [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    // Scripts need the nonce: the embed-height script, the answer check and, when enabled, Turnstile.
    turnstile
      ? `script-src 'nonce-${nonce}' https://challenges.cloudflare.com`
      : `script-src 'nonce-${nonce}'`,
    turnstile ? "frame-src https://challenges.cloudflare.com" : "",
    turnstile ? "connect-src https://challenges.cloudflare.com" : "",
    "img-src 'self' data:",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors *",
  ]
    .filter(Boolean)
    .join("; ");
}
