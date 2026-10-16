import { createMiddleware } from "hono/factory";
import { currentUser, type SessionUser } from "./auth/session.js";
import type { Deps, Env } from "./env.js";

export type OwnerEnv = { Bindings: Env; Variables: { user: SessionUser } };

/** Rejects requests without a valid session and exposes the user as `c.var.user`. */
export const requireUser = (deps: Deps) =>
  createMiddleware<OwnerEnv>(async (c, next) => {
    const user = await currentUser(c, deps.now());
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    c.set("user", user);
    await next();
  });
