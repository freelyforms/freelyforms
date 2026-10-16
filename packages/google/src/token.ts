import { errorFromResponse, GoogleApiError } from "./errors.js";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface AccessToken {
  token: string;
  /** Epoch milliseconds; refresh a minute early. */
  expiresAt: number;
  scopes: string[];
}

/** Exchanges a stored refresh token for a short-lived access token. */
export async function refreshAccessToken(
  fetchFn: typeof fetch,
  args: { clientId: string; clientSecret: string; refreshToken: string; now: number },
): Promise<AccessToken> {
  let res: Response;
  try {
    res = await fetchFn(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: args.clientId,
        client_secret: args.clientSecret,
        refresh_token: args.refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch {
    throw new GoogleApiError("TRANSIENT", 0, "network");
  }
  // Only `invalid_grant` means the owner's grant is gone. Other 4xx answers (`invalid_client`,
  // `unauthorized_client`) are our own configuration problem: treating them as revoked access would
  // mark every owner's connection revoked after one bad secret rotation, so they are retried.
  if (!res.ok) {
    const err = await errorFromResponse(res);
    if (err.reason === "invalid_grant")
      throw new GoogleApiError("ACCESS_REVOKED", res.status, "invalid_grant");
    if (err.kind === "ACCESS_REVOKED" || err.kind === "INVALID_REQUEST")
      throw new GoogleApiError("TRANSIENT", res.status, err.reason ?? "token_endpoint_error");
    throw err;
  }
  const body = (await res.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
  };
  if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new GoogleApiError("TRANSIENT", res.status, "malformed_token_response");
  }
  return {
    token: body.access_token,
    expiresAt: args.now + (body.expires_in - 60) * 1000,
    scopes: typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : [],
  };
}

export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/**
 * Revokes a refresh token (and the grant behind it) at Google. Returns true when the grant is
 * gone, including when Google reports the token as already invalid; false when Google could not
 * be reached or refused for another reason.
 */
export async function revokeToken(fetchFn: typeof fetch, token: string): Promise<boolean> {
  try {
    const res = await fetchFn(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    if (res.ok) return true;
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    return res.status === 400 && body.error === "invalid_token";
  } catch {
    return false;
  }
}
