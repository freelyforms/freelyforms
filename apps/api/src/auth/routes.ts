import { decryptText, encrypt, type Envelope } from "@freelyforms/crypto";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Deps, Env } from "../env.js";
import { keyringFor } from "../keys.js";
import { base64Url, decodeBase64UrlText, newId, randomToken, safeEqual } from "../util.js";
import {
  authorizationUrl,
  DRIVE_FILE_SCOPE,
  exchangeCode,
  GoogleAuthError,
  pkceChallenge,
  verifyIdToken,
} from "./google.js";
import { currentUser, endSession, startSession } from "./session.js";

const TXN_COOKIE = "ff_oauth";
const TXN_TTL_S = 600;
const TXN_AAD = "oauth-transaction";

interface Transaction {
  state: string;
  nonce: string;
  verifier: string;
  consent: boolean;
  exp: number;
}

type Ctx = Context<{ Bindings: Env }>;

const redirectUri = (c: Ctx) => `${new URL(c.req.url).origin}/auth/google/callback`;

/** Browser-facing failure: back to the start page with a short, non-sensitive code. */
const fail = (c: Ctx, code: string) =>
  c.redirect(`/app/?auth_error=${encodeURIComponent(code)}`, 302);

async function readTransaction(c: Ctx, now: number): Promise<Transaction | null> {
  const raw = getCookie(c, TXN_COOKIE, "host");
  deleteCookie(c, TXN_COOKIE, { prefix: "host", path: "/", secure: true });
  if (raw === undefined) return null;
  try {
    const envelope = JSON.parse(decodeBase64UrlText(raw)) as Envelope;
    const txn = JSON.parse(
      await decryptText(await keyringFor(c.env), envelope, TXN_AAD),
    ) as Transaction;
    return txn.exp > now ? txn : null;
  } catch {
    return null;
  }
}

export function authRoutes(deps: Deps): Hono<{ Bindings: Env }> {
  const auth = new Hono<{ Bindings: Env }>();

  auth.get("/google/start", async (c) => {
    const txn: Transaction = {
      state: randomToken(),
      nonce: randomToken(),
      verifier: randomToken(48),
      consent: c.req.query("consent") === "1",
      exp: deps.now() + TXN_TTL_S * 1000,
    };
    const envelope = await encrypt(await keyringFor(c.env), JSON.stringify(txn), TXN_AAD);
    setCookie(c, TXN_COOKIE, base64Url(new TextEncoder().encode(JSON.stringify(envelope))), {
      prefix: "host",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: TXN_TTL_S,
    });
    return c.redirect(
      authorizationUrl({
        clientId: c.env.GOOGLE_CLIENT_ID,
        redirectUri: redirectUri(c),
        state: txn.state,
        nonce: txn.nonce,
        codeChallenge: await pkceChallenge(txn.verifier),
        consent: txn.consent,
      }),
      302,
    );
  });

  auth.get("/google/callback", async (c) => {
    const now = deps.now();
    const txn = await readTransaction(c, now);
    if (c.req.query("error") !== undefined) return fail(c, "access_denied");
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!txn || code === undefined || state === undefined || !safeEqual(state, txn.state)) {
      return fail(c, "invalid_state");
    }

    let identity;
    let tokens;
    try {
      tokens = await exchangeCode(deps.fetch, {
        clientId: c.env.GOOGLE_CLIENT_ID,
        clientSecret: c.env.GOOGLE_CLIENT_SECRET,
        code,
        codeVerifier: txn.verifier,
        redirectUri: redirectUri(c),
      });
      identity = verifyIdToken(tokens.idToken, {
        clientId: c.env.GOOGLE_CLIENT_ID,
        nonce: txn.nonce,
        nowMs: now,
      });
    } catch (err) {
      return fail(c, err instanceof GoogleAuthError ? err.code : "sign_in_failed");
    }

    const db = c.env.DB;
    let user = await db
      .prepare("SELECT id FROM users WHERE google_sub = ?")
      .bind(identity.sub)
      .first<{ id: string }>();
    const connection = user
      ? await db
          .prepare("SELECT status FROM google_connections WHERE user_id = ?")
          .bind(user.id)
          .first<{ status: string }>()
      : null;

    // Without a stored, working refresh token we must ask Google for one, which needs consent.
    if (tokens.refreshToken === undefined && connection?.status !== "active") {
      return txn.consent
        ? fail(c, "no_refresh_token")
        : c.redirect("/auth/google/start?consent=1", 302);
    }

    if (user) {
      await db
        .prepare("UPDATE users SET email = ?, name = ? WHERE id = ?")
        .bind(identity.email, identity.name ?? null, user.id)
        .run();
    } else {
      user = { id: newId("usr") };
      await db
        .prepare(
          "INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(user.id, identity.sub, identity.email, identity.name ?? null, now)
        .run();
    }

    const scopes = tokens.scopes.join(" ");
    if (tokens.refreshToken !== undefined) {
      const envelope = await encrypt(
        await keyringFor(c.env),
        tokens.refreshToken,
        `google-refresh:${user.id}`,
      );
      await db
        .prepare(
          `INSERT INTO google_connections (id, user_id, scopes, refresh_token, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET scopes = excluded.scopes,
             refresh_token = excluded.refresh_token, status = 'active', updated_at = excluded.updated_at`,
        )
        .bind(newId("gc"), user.id, scopes, JSON.stringify(envelope), now, now)
        .run();
    } else {
      await db
        .prepare("UPDATE google_connections SET scopes = ?, updated_at = ? WHERE user_id = ?")
        .bind(scopes, now, user.id)
        .run();
    }

    // Rotate: a new sign-in always replaces the browser's previous session.
    await endSession(c);
    await startSession(c, user.id, now);
    return c.redirect("/app/", 302);
  });

  auth.get("/me", async (c) => {
    const user = await currentUser(c, deps.now());
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    const connection = await c.env.DB.prepare(
      "SELECT scopes, status FROM google_connections WHERE user_id = ?",
    )
      .bind(user.id)
      .first<{ scopes: string; status: string }>();
    return c.json({
      user,
      google: {
        status: connection?.status ?? "missing",
        driveAccess: connection?.scopes.split(" ").includes(DRIVE_FILE_SCOPE) ?? false,
      },
    });
  });

  auth.post("/logout", async (c) => {
    await endSession(c);
    return c.redirect("/app/", 303);
  });

  return auth;
}
