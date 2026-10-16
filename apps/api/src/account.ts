import { decryptText, type Envelope } from "@freelyforms/crypto";
import { revokeToken } from "@freelyforms/google";
import { Hono, type Context } from "hono";
import { deleteCookie } from "hono/cookie";
import { SESSION_COOKIE } from "./auth/session.js";
import type { Deps, Env } from "./env.js";
import { keyringFor } from "./keys.js";
import { requireUser, type OwnerEnv } from "./require-user.js";

type Ctx = Context<OwnerEnv>;

/** Revokes the user's Google grant (best effort) and deletes the stored token. */
async function disconnectGoogle(c: Ctx, deps: Deps): Promise<{ revoked: boolean }> {
  const userId = c.var.user.id;
  const row = await c.env.DB.prepare(
    "SELECT refresh_token FROM google_connections WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ refresh_token: string }>();
  if (!row) return { revoked: true };
  let revoked: boolean;
  try {
    const token = await decryptText(
      await keyringFor(c.env),
      JSON.parse(row.refresh_token) as Envelope,
      `google-refresh:${userId}`,
    );
    revoked = await revokeToken(deps.fetch, token);
  } catch {
    // An undecryptable token cannot be used by anyone; deleting it below is enough.
    revoked = true;
  }
  // The token is deleted even if Google could not be reached: we must not keep it.
  await c.env.DB.prepare("DELETE FROM google_connections WHERE user_id = ?").bind(userId).run();
  return { revoked };
}

/** Deletes every held (encrypted) delivery of the user's destinations from the hold store. */
async function deleteHeld(env: Env, userId: string): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT d.id FROM destinations d JOIN forms f ON f.id = d.form_id WHERE f.owner_id = ?",
  )
    .bind(userId)
    .all<{ id: string }>();
  for (const { id } of results) {
    let cursor: string | undefined;
    do {
      const page = await env.HOLD.list({ prefix: `hold:${id}:`, ...(cursor ? { cursor } : {}) });
      for (const { name } of page.keys) await env.HOLD.delete(name);
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
}

/**
 * Account management (docs/SECURITY_PRIVACY.md, Data deletion). Nothing here touches the owner's
 * spreadsheets or Drive files.
 */
export function accountRoutes(deps: Deps): Hono<OwnerEnv> {
  const account = new Hono<OwnerEnv>();
  account.use(requireUser(deps));

  /**
   * Disconnects Google: revokes the grant and deletes the token. Published forms keep accepting
   * responses, which wait (blocked, encrypted, at most 7 days) until the owner signs in again.
   */
  account.post("/google/disconnect", async (c) => {
    const { revoked } = await disconnectGoogle(c, deps);
    return c.json({ disconnected: true, revokedAtGoogle: revoked });
  });

  /**
   * Deletes the account: revokes Google access, deletes held deliveries, and deletes the user with
   * all metadata (sessions, forms, versions, destinations, delivery records) by cascade. The body
   * must repeat the account email as confirmation.
   */
  account.delete("/", async (c) => {
    const body = await c.req.json<{ confirm?: unknown }>().catch(() => ({ confirm: undefined }));
    if (
      typeof body.confirm !== "string" ||
      body.confirm.trim().toLowerCase() !== c.var.user.email.toLowerCase()
    ) {
      return c.json({ error: "confirmation_required" }, 422);
    }
    const { revoked } = await disconnectGoogle(c, deps);
    await deleteHeld(c.env, c.var.user.id);
    await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(c.var.user.id).run();
    deleteCookie(c, SESSION_COOKIE, { prefix: "host", path: "/", secure: true });
    return c.json({ deleted: true, revokedAtGoogle: revoked });
  });

  return account;
}
