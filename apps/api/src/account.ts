import { decryptText, type Envelope } from "@freelyforms/crypto";
import { revokeToken } from "@freelyforms/google";
import { Hono, type Context } from "hono";
import { deleteCookie } from "hono/cookie";
import { SESSION_COOKIE } from "./auth/session.js";
import type { Deps } from "./env.js";
import { holdKey } from "./delivery/hold.js";
import { keyringFor } from "./keys.js";
import { requireUser, type OwnerEnv } from "./require-user.js";

type Ctx = Context<OwnerEnv>;

/** The user's decrypted refresh token, or null when there is none or it cannot be decrypted. */
async function refreshTokenOf(c: Ctx): Promise<string | null> {
  const userId = c.var.user.id;
  const row = await c.env.DB.prepare(
    "SELECT refresh_token FROM google_connections WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ refresh_token: string }>();
  if (!row) return null;
  try {
    return await decryptText(
      await keyringFor(c.env),
      JSON.parse(row.refresh_token) as Envelope,
      `google-refresh:${userId}`,
    );
  } catch {
    return null; // an undecryptable token cannot be used by anyone
  }
}

/** Asks Google to revoke a token; no token means nothing to revoke. Never throws. */
const revoke = async (deps: Deps, token: string | null): Promise<boolean> =>
  token === null ? true : revokeToken(deps.fetch, token);

/**
 * Account management (docs/SECURITY_PRIVACY.md, Data deletion). Nothing here touches the owner's
 * spreadsheets or Drive files.
 */
export function accountRoutes(deps: Deps): Hono<OwnerEnv> {
  const account = new Hono<OwnerEnv>();
  account.use(requireUser(deps));

  /**
   * Disconnects Google: deletes the stored token and asks Google to revoke the grant. Published
   * forms keep accepting responses, which wait (blocked, encrypted, at most 7 days); signing in
   * again resumes them.
   */
  account.post("/google/disconnect", async (c) => {
    const token = await refreshTokenOf(c);
    // The token is deleted even if Google cannot be reached: we must not keep it.
    await c.env.DB.prepare("DELETE FROM google_connections WHERE user_id = ?")
      .bind(c.var.user.id)
      .run();
    return c.json({ disconnected: true, revokedAtGoogle: await revoke(deps, token) });
  });

  /**
   * Deletes the account. The user and all metadata (sessions, connection, forms, versions,
   * destinations, delivery records) go first, by cascade, so a later failure cannot leave the
   * account behind. Then, best effort: Google revokes the grant, and held payloads are deleted from
   * the hold store (anything missed expires there within 7 days). The body must repeat the account
   * email as confirmation.
   */
  account.delete("/", async (c) => {
    const body = await c.req.json<{ confirm?: unknown }>().catch(() => ({ confirm: undefined }));
    if (
      typeof body.confirm !== "string" ||
      body.confirm.trim().toLowerCase() !== c.var.user.email.toLowerCase()
    ) {
      return c.json({ error: "confirmation_required" }, 422);
    }
    const userId = c.var.user.id;
    const token = await refreshTokenOf(c);
    const { results: held } = await c.env.DB.prepare(
      `SELECT x.destination_id, x.submission_id FROM deliveries x JOIN forms f ON f.id = x.form_id
       WHERE f.owner_id = ? AND x.held_at IS NOT NULL AND x.destination_id IS NOT NULL`,
    )
      .bind(userId)
      .all<{ destination_id: string; submission_id: string }>();
    await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
    deleteCookie(c, SESSION_COOKIE, { prefix: "host", path: "/", secure: true });

    const revoked = await revoke(deps, token);
    for (const { destination_id, submission_id } of held) {
      await c.env.HOLD.delete(holdKey(destination_id, submission_id)).catch(() => undefined);
    }
    return c.json({ deleted: true, revokedAtGoogle: revoked });
  });

  return account;
}
