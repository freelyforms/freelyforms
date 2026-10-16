import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "../env.js";
import { randomToken, sha256Base64Url } from "../util.js";

export const SESSION_COOKIE = "ff_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Ctx = Context<{ Bindings: Env }>;

/** Creates a session; only the SHA-256 of the token is stored. */
export async function startSession(c: Ctx, userId: string, now: number): Promise<void> {
  const token = randomToken();
  await c.env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(await sha256Base64Url(token), userId, now, now + SESSION_TTL_MS, now)
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    prefix: "host",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export async function currentUser(c: Ctx, now: number): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE, "host");
  if (token === undefined) return null;
  return c.env.DB.prepare(
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.deleted_at IS NULL`,
  )
    .bind(await sha256Base64Url(token), now)
    .first<SessionUser>();
}

export async function endSession(c: Ctx): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE, "host");
  if (token !== undefined) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await sha256Base64Url(token))
      .run();
  }
  deleteCookie(c, SESSION_COOKIE, { prefix: "host", path: "/", secure: true });
}
