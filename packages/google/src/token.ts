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
  // The token endpoint reports a revoked or expired grant as 400 invalid_grant.
  if (!res.ok) {
    const err = await errorFromResponse(res);
    throw err.reason === "invalid_grant"
      ? new GoogleApiError("ACCESS_REVOKED", res.status, "invalid_grant")
      : err;
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
