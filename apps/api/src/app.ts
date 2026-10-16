import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { FORM_SCHEMA_VERSION } from "@freelyforms/form-schema/limits";

export interface Env {
  DB: D1Database;
}

export const app = new Hono<{ Bindings: Env }>();

app.use(secureHeaders());

app.get("/health", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT count(*) AS tables FROM sqlite_schema WHERE type = 'table'",
  ).first<{ tables: number }>();
  return c.json({ ok: true, schemaVersion: FORM_SCHEMA_VERSION, db: row ? "ok" : "unavailable" });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  // Log the error type only: messages and stacks may contain request data.
  console.error("unhandled_error", err.name);
  return c.json({ error: "internal_error" }, 500);
});
