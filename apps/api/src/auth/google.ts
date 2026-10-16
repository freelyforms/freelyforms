import { base64Url, decodeJwtPayload } from "../util.js";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
/** ADR 0006: the only scopes the app requests. */
export const SCOPES = ["openid", "email", "profile", DRIVE_FILE_SCOPE] as const;

const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export class GoogleAuthError extends Error {
  override readonly name = "GoogleAuthError";
  constructor(readonly code: string) {
    super(code);
  }
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export interface AuthRequest {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  /** Force the consent screen, which is the only way to get a new refresh token. */
  consent: boolean;
}

export function authorizationUrl(r: AuthRequest): string {
  const params = new URLSearchParams({
    client_id: r.clientId,
    redirect_uri: r.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    state: r.state,
    nonce: r.nonce,
    code_challenge: r.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: r.consent ? "consent" : "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface TokenResponse {
  idToken: string;
  refreshToken: string | undefined;
  scopes: string[];
}

export async function exchangeCode(
  fetchFn: typeof fetch,
  args: {
    clientId: string;
    clientSecret: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  },
): Promise<TokenResponse> {
  const res = await fetchFn(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      code: args.code,
      code_verifier: args.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: args.redirectUri,
    }),
  });
  if (!res.ok) throw new GoogleAuthError("token_exchange_failed");
  const body = await res.json<Record<string, unknown>>();
  if (typeof body.id_token !== "string") throw new GoogleAuthError("token_exchange_failed");
  return {
    idToken: body.id_token,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    scopes: typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : [],
  };
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | undefined;
}

/**
 * Validates the ID token claims. The token comes straight from Google's token endpoint over TLS,
 * which OpenID Connect Core §3.1.3.7 accepts in place of signature verification.
 */
export function verifyIdToken(
  idToken: string,
  expected: { clientId: string; nonce: string; nowMs: number },
): GoogleIdentity {
  let claims: Record<string, unknown>;
  try {
    claims = decodeJwtPayload(idToken) as Record<string, unknown>;
  } catch {
    throw new GoogleAuthError("invalid_id_token");
  }
  const { iss, aud, exp, nonce, sub, email, email_verified: verified, name } = claims;
  if (typeof iss !== "string" || !ISSUERS.has(iss)) throw new GoogleAuthError("invalid_id_token");
  if (aud !== expected.clientId) throw new GoogleAuthError("invalid_id_token");
  if (typeof exp !== "number" || exp * 1000 < expected.nowMs) {
    throw new GoogleAuthError("invalid_id_token");
  }
  if (nonce !== expected.nonce) throw new GoogleAuthError("invalid_id_token");
  if (typeof sub !== "string" || sub === "") throw new GoogleAuthError("invalid_id_token");
  if (typeof email !== "string" || verified !== true)
    throw new GoogleAuthError("email_not_verified");
  return { sub, email, name: typeof name === "string" ? name : undefined };
}
