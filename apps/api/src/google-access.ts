import { decryptText, type Envelope } from "@freelyforms/crypto";
import {
  GoogleApiError,
  refreshAccessToken,
  type AccessToken,
  sheetsClient,
  type SheetsClient,
} from "@freelyforms/google";
import type { Deps, Env } from "./env.js";
import { keyringFor } from "./keys.js";

/**
 * A Sheets client acting as the given user. A revoked grant marks the connection `revoked` and
 * throws `GoogleApiError("ACCESS_REVOKED")`.
 */
export async function sheetsFor(env: Env, deps: Deps, userId: string): Promise<SheetsClient> {
  return sheetsClient(deps.fetch, (await accessTokenFor(env, deps, userId)).token);
}

/** A short-lived access token for the user (same failure handling as `sheetsFor`). */
export async function accessTokenFor(env: Env, deps: Deps, userId: string): Promise<AccessToken> {
  const row = await env.DB.prepare(
    "SELECT refresh_token, status FROM google_connections WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ refresh_token: string; status: string }>();
  if (!row || row.status !== "active")
    throw new GoogleApiError("ACCESS_REVOKED", 0, "no_active_connection");
  const refreshToken = await decryptText(
    await keyringFor(env),
    JSON.parse(row.refresh_token) as Envelope,
    `google-refresh:${userId}`,
  );
  try {
    const access = await refreshAccessToken(deps.fetch, {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      refreshToken,
      now: deps.now(),
    });
    return access;
  } catch (err) {
    // A rejected client ID or secret is a deployment problem, not the owner's: make it visible.
    if (
      err instanceof GoogleApiError &&
      err.kind === "TRANSIENT" &&
      err.status >= 400 &&
      err.status < 500
    )
      console.error("google_token_rejected", err.reason ?? String(err.status));
    if (err instanceof GoogleApiError && err.kind === "ACCESS_REVOKED") {
      await env.DB.prepare(
        "UPDATE google_connections SET status = 'revoked', updated_at = ? WHERE user_id = ?",
      )
        .bind(deps.now(), userId)
        .run();
    }
    throw err;
  }
}

export const spreadsheetUrl = (spreadsheetId: string, sheetId: number) =>
  `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${String(sheetId)}`;
