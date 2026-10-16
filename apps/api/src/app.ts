import { Hono } from "hono";
import { html } from "hono/html";
import { secureHeaders } from "hono/secure-headers";
import { FORM_SCHEMA_VERSION } from "@freelyforms/form-schema/limits";
import { DRIVE_FILE_SCOPE } from "./auth/google.js";
import { authRoutes } from "./auth/routes.js";
import { currentUser } from "./auth/session.js";
import { defaultDeps, type Deps, type Env } from "./env.js";

export type { Env } from "./env.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createApp(deps: Deps = defaultDeps): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // Not `no-referrer` (the Hono default): with it, browsers send `Origin: null` on same-origin
  // form posts, which the origin check below would reject.
  app.use(secureHeaders({ referrerPolicy: "strict-origin-when-cross-origin" }));

  // CSRF baseline: state-changing requests must come from our own origin.
  app.use(async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header("origin");
      if (origin !== new URL(c.req.url).origin) return c.json({ error: "forbidden_origin" }, 403);
    }
    await next();
  });

  app.get("/health", async (c) => {
    const row = await c.env.DB.prepare(
      "SELECT count(*) AS tables FROM sqlite_schema WHERE type = 'table'",
    ).first<{ tables: number }>();
    return c.json({ ok: true, schemaVersion: FORM_SCHEMA_VERSION, db: row ? "ok" : "unavailable" });
  });

  app.route("/auth", authRoutes(deps));

  // Temporary landing page until apps/web exists: lets developers try sign-in end to end.
  app.get("/", async (c) => {
    const user = await currentUser(c, deps.now());
    const error = c.req.query("auth_error");
    const connection = user
      ? await c.env.DB.prepare("SELECT scopes FROM google_connections WHERE user_id = ?")
          .bind(user.id)
          .first<{ scopes: string }>()
      : null;
    const driveAccess = connection?.scopes.split(" ").includes(DRIVE_FILE_SCOPE) ?? false;
    return c.html(
      html`<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Freely Forms (development)</title>
          </head>
          <body>
            <h1>Freely Forms</h1>
            ${error ? html`<p role="alert">Sign-in failed: ${error}</p>` : ""}
            ${
              user
                ? html`<p>Signed in as ${user.email}.</p>
                    ${
                      driveAccess
                        ? html`<p>Google Drive access: granted.</p>`
                        : html`<p>
                            Google Drive access is needed to create response sheets.
                            <a href="/auth/google/start?consent=1">Grant Google Drive access</a>
                          </p>`
                    }
                    <p><a href="/auth/me">Account JSON</a></p>
                    <form method="post" action="/auth/logout"><button>Sign out</button></form>`
                : html`<p><a href="/auth/google/start">Sign in with Google</a></p>`
            }
          </body>
        </html>`,
    );
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.onError((err, c) => {
    // Log the error type only: messages and stacks may contain request data.
    console.error("unhandled_error", err.name);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

export const app = createApp();
