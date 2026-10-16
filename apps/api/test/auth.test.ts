import { generateMasterKeySecret } from "@freelyforms/crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pkceChallenge } from "../src/auth/google.js";
import { createApp, type Env } from "../src/app.js";
import type { Deps } from "../src/env.js";
import { base64Url } from "../src/util.js";
import { localD1 } from "./d1.js";
import { fakeKv, fakeQueue } from "./fakes.js";

const CLIENT_ID = "test-client.apps.googleusercontent.com";
const ORIGIN = "http://localhost";
const NOW = Date.UTC(2026, 9, 16, 12);
const REFRESH = "1//refresh-token-secret";

let d1: Awaited<ReturnType<typeof localD1>>;
let env: Env;

beforeAll(async () => {
  d1 = await localD1();
  env = {
    DB: d1.db,
    DELIVERY_QUEUE: fakeQueue().queue,
    HOLD: fakeKv(() => NOW).kv,
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: "test-secret",
    MASTER_KEY_K1: generateMasterKeySecret(),
  };
}, 60_000);

afterAll(async () => {
  await d1.dispose();
});

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM sessions"), env.DB.prepare("DELETE FROM users")]);
});

/** A Google account and the token endpoint's behaviour. */
interface FakeGoogle {
  sub: string;
  claims?: Record<string, unknown>;
  refreshToken?: string | undefined;
  scope?: string;
  status?: number;
}

const b64 = (o: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(o)));

function harness(google: FakeGoogle) {
  const tokenRequests: URLSearchParams[] = [];
  let nonce = "";
  const deps: Deps = {
    now: () => NOW,
    fetch: (_input, init) => {
      tokenRequests.push(new URLSearchParams(init?.body as string));
      const claims = {
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        exp: NOW / 1000 + 3600,
        nonce,
        sub: google.sub,
        email: `${google.sub}@example.com`,
        email_verified: true,
        name: "Test User",
        ...google.claims,
      };
      const body = {
        id_token: `${b64({ alg: "RS256" })}.${b64(claims)}.sig`,
        ...(google.refreshToken === undefined ? {} : { refresh_token: google.refreshToken }),
        scope:
          google.scope ??
          "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/drive.file",
      };
      return Promise.resolve(Response.json(body, { status: google.status ?? 200 }));
    },
  };
  const app = createApp(deps);
  const jar = new Map<string, string>();

  const send = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await app.request(path, { ...init, headers }, env);
    for (const cookie of res.headers.getSetCookie()) {
      const [pair = ""] = cookie.split(";");
      const [name = "", value = ""] = pair.split("=");
      if (/max-age=0/i.test(cookie) || value === "") jar.delete(name);
      else jar.set(name, value);
    }
    return res;
  };

  /** Runs /auth/google/start and returns the parsed Google authorization URL. */
  const start = async (query = "") => {
    const res = await send(`/auth/google/start${query}`);
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location") ?? "");
    nonce = url.searchParams.get("nonce") ?? "";
    return { res, url };
  };

  const callback = (state: string, code = "auth-code") =>
    send(`/auth/google/callback?code=${code}&state=${encodeURIComponent(state)}`);

  /** Full sign-in: start → (Google) → callback. */
  const signIn = async (query = "") => {
    const { url } = await start(query);
    return callback(url.searchParams.get("state") ?? "");
  };

  return { send, start, callback, signIn, jar, tokenRequests };
}

const location = (res: Response) => res.headers.get("location");

describe("GET /auth/google/start", () => {
  it("redirects to Google with PKCE, state, nonce and only the ADR 0006 scopes", async () => {
    const { start, jar } = harness({ sub: "g1" });
    const { res, url } = await start();
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const p = url.searchParams;
    expect(p.get("client_id")).toBe(CLIENT_ID);
    expect(p.get("redirect_uri")).toBe(`${ORIGIN}/auth/google/callback`);
    expect(p.get("scope")).toBe("openid email profile https://www.googleapis.com/auth/drive.file");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("select_account");
    expect(p.get("state")).toHaveLength(43);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^__Host-ff_oauth=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(jar.get("__Host-ff_oauth")).not.toContain(p.get("state"));
  });
});

describe("GET /auth/google/callback", () => {
  it("signs in a new user, stores the refresh token encrypted and starts a session", async () => {
    const h = harness({ sub: "new-user", refreshToken: REFRESH });
    const { url } = await h.start("?consent=1");
    expect(url.searchParams.get("prompt")).toBe("consent");
    const res = await h.callback(url.searchParams.get("state") ?? "");
    expect(res.status).toBe(302);
    expect(location(res)).toBe("/app/");
    expect(res.headers.getSetCookie().join()).toMatch(/__Host-ff_session=.+HttpOnly/);

    const sent = h.tokenRequests[0];
    expect(sent?.get("client_secret")).toBe("test-secret");
    expect(sent?.get("redirect_uri")).toBe(`${ORIGIN}/auth/google/callback`);
    expect(await pkceChallenge(sent?.get("code_verifier") ?? "")).toBe(
      url.searchParams.get("code_challenge"),
    );

    const row = await env.DB.prepare(
      "SELECT c.refresh_token, s.token_hash FROM google_connections c JOIN sessions s USING (user_id)",
    ).first<{ refresh_token: string; token_hash: string }>();
    expect(row?.refresh_token).not.toContain(REFRESH);
    expect(JSON.parse(row?.refresh_token ?? "{}")).toMatchObject({ v: 1, kid: "k1" });
    expect(row?.token_hash).not.toBe(h.jar.get("__Host-ff_session"));

    const me = await (await h.send("/auth/me")).json<{ user: { id: string } }>();
    expect(me.user.id).toMatch(/^usr_[a-z0-9]{16}$/);
    expect(me).toEqual({
      user: { id: me.user.id, email: "new-user@example.com", name: "Test User" },
      google: { status: "active", driveAccess: true },
    });
  });

  it("asks for consent when a new user arrives without a refresh token", async () => {
    const h = harness({ sub: "no-refresh" });
    const res = await h.signIn();
    expect(location(res)).toBe("/auth/google/start?consent=1");
    expect(h.jar.has("__Host-ff_session")).toBe(false);
  });

  it("fails rather than looping when consent still returns no refresh token", async () => {
    const res = await harness({ sub: "stubborn" }).signIn("?consent=1");
    expect(location(res)).toBe("/app/?auth_error=no_refresh_token");
  });

  it("lets a returning user sign in without a new refresh token", async () => {
    await harness({ sub: "returning", refreshToken: REFRESH }).signIn("?consent=1");
    const h = harness({ sub: "returning" });
    expect(location(await h.signIn())).toBe("/app/");
    expect((await h.send("/auth/me")).status).toBe(200);
    const users = await env.DB.prepare("SELECT count(*) AS n FROM users").first("n");
    expect(users).toBe(1);
  });

  it("marks destinations blocked for lack of access OK again when the owner signs back in", async () => {
    const h = harness({ sub: "back-again", refreshToken: REFRESH });
    await h.signIn("?consent=1");
    const userId = (await env.DB.prepare("SELECT id FROM users").first("id")) as string;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO forms (id, owner_id, title, status, draft_json, created_at, updated_at) VALUES ('frm_back01', ?, 'T', 'draft', '{}', 1, 1)",
      ).bind(userId),
      env.DB.prepare(
        "INSERT INTO destinations (id, form_id, type, spreadsheet_id, sheet_id, state, created_at, updated_at) VALUES ('dst_back01', 'frm_back01', 'google_sheet', 's', 0, 'ACCESS_REVOKED', 1, 1)",
      ),
      env.DB.prepare("DELETE FROM google_connections"),
    ]);
    await harness({ sub: "back-again", refreshToken: REFRESH }).signIn("?consent=1");
    expect(await env.DB.prepare("SELECT state FROM destinations").first("state")).toBe("OK");
  });

  it("records missing Drive access when the user unticks it", async () => {
    const h = harness({ sub: "no-drive", refreshToken: REFRESH, scope: "openid email profile" });
    await h.signIn("?consent=1");
    expect(await (await h.send("/auth/me")).json()).toMatchObject({
      google: { status: "active", driveAccess: false },
    });

    // Granting Drive later updates the same connection.
    const again = harness({ sub: "no-drive", refreshToken: REFRESH });
    await again.signIn("?consent=1");
    expect(await (await again.send("/auth/me")).json()).toMatchObject({
      google: { driveAccess: true },
    });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM google_connections").first("n")).toBe(1);
  });

  it.each([
    ["wrong audience", { aud: "someone-else" }, "invalid_id_token"],
    ["wrong issuer", { iss: "https://evil.example" }, "invalid_id_token"],
    ["wrong nonce", { nonce: "replayed" }, "invalid_id_token"],
    ["expired token", { exp: NOW / 1000 - 1 }, "invalid_id_token"],
    ["unverified email", { email_verified: false }, "email_not_verified"],
  ])("rejects an ID token with %s", async (_name, claims, code) => {
    const h = harness({ sub: "bad", refreshToken: REFRESH, claims });
    const res = await h.signIn("?consent=1");
    expect(location(res)).toBe(`/app/?auth_error=${code}`);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM users").first("n")).toBe(0);
  });

  it("rejects a mismatched state", async () => {
    const h = harness({ sub: "csrf" });
    await h.start();
    expect(location(await h.callback("forged"))).toBe("/app/?auth_error=invalid_state");
    expect(h.tokenRequests).toHaveLength(0);
  });

  it("rejects a callback without the transaction cookie", async () => {
    const h = harness({ sub: "csrf" });
    const { url } = await h.start();
    h.jar.clear();
    expect(location(await h.callback(url.searchParams.get("state") ?? ""))).toBe(
      "/app/?auth_error=invalid_state",
    );
  });

  it("handles the user cancelling on Google's screen", async () => {
    const h = harness({ sub: "cancel" });
    await h.start();
    const res = await h.send("/auth/google/callback?error=access_denied&state=x");
    expect(location(res)).toBe("/app/?auth_error=access_denied");
  });

  it("handles a failed token exchange", async () => {
    const res = await harness({ sub: "fail", status: 400 }).signIn("?consent=1");
    expect(location(res)).toBe("/app/?auth_error=token_exchange_failed");
  });
});

describe("sessions", () => {
  it("rejects requests without a session", async () => {
    expect((await harness({ sub: "anon" }).send("/auth/me")).status).toBe(401);
  });

  it("replaces the previous session when the same browser signs in again", async () => {
    const h = harness({ sub: "rotate", refreshToken: REFRESH });
    await h.signIn("?consent=1");
    const first = h.jar.get("__Host-ff_session");
    await h.signIn("?consent=1");
    expect(h.jar.get("__Host-ff_session")).not.toBe(first);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM sessions").first("n")).toBe(1);
  });

  it("signs out only with a same-origin POST", async () => {
    const h = harness({ sub: "logout", refreshToken: REFRESH });
    await h.signIn("?consent=1");
    expect((await h.send("/auth/logout", { method: "POST" })).status).toBe(403);
    expect(
      (
        await h.send("/auth/logout", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        })
      ).status,
    ).toBe(403);
    expect((await h.send("/auth/me")).status).toBe(200);

    const res = await h.send("/auth/logout", { method: "POST", headers: { origin: ORIGIN } });
    expect(res.status).toBe(303);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM sessions").first("n")).toBe(0);
    expect((await h.send("/auth/me")).status).toBe(401);
  });

  it("serves a homepage linking the privacy policy; the app needs a build when assets are missing", async () => {
    const h = harness({ sub: "landing", refreshToken: REFRESH });
    const home = await h.send("/");
    expect(await home.text()).toContain('href="/privacy"');
    const res = await h.send("/app/forms");
    expect(res.status).toBe(503);
  });
});
