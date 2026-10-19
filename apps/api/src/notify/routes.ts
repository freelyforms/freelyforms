/**
 * The unsubscribe link in notification emails (ADR 0026). Opening it shows a button: mail
 * scanners that follow links must not turn notifications off; only the POST does.
 */
import { Hono, type Context } from "hono";
import { html } from "hono/html";
import type { Env } from "../env.js";
import { validUnsubscribe } from "./notify.js";

type Ctx = Context<{ Bindings: Env }>;

const page = (c: Ctx, title: string, body: ReturnType<typeof html>, status: 200 | 404 = 200) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
  return c.html(
    html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${title} · Freely Forms</title>
        </head>
        <body>
          <main>
            <h1>${title}</h1>
            ${body}
          </main>
        </body>
      </html>`,
    status,
  );
};

async function checked(c: Ctx, form: string, token: string) {
  if (!/^frm_[A-Za-z0-9]{6,32}$/.test(form)) return false;
  return validUnsubscribe(c.env, form, token);
}

export function notifyRoutes(): Hono<{ Bindings: Env }> {
  const notify = new Hono<{ Bindings: Env }>();

  notify.get("/off", async (c) => {
    const form = c.req.query("form") ?? "";
    const token = c.req.query("token") ?? "";
    if (!(await checked(c, form, token))) {
      return page(c, "Link not valid", html`<p>This link is not valid.</p>`, 404);
    }
    return page(
      c,
      "Turn off emails for this form?",
      html`<p>
          You will no longer get an email when this form receives responses. You can turn them on
          again on the form's Publish tab.
        </p>
        <form method="post">
          <input type="hidden" name="form" value="${form}" />
          <input type="hidden" name="token" value="${token}" />
          <button type="submit">Turn off emails</button>
        </form>`,
    );
  });

  notify.post("/off", async (c) => {
    const body = await c.req.parseBody();
    const form = typeof body.form === "string" ? body.form : "";
    const token = typeof body.token === "string" ? body.token : "";
    if (!(await checked(c, form, token))) {
      return page(c, "Link not valid", html`<p>This link is not valid.</p>`, 404);
    }
    await c.env.DB.prepare("DELETE FROM form_notifications WHERE form_id = ?").bind(form).run();
    return page(c, "Emails turned off", html`<p>You will no longer get emails for this form.</p>`);
  });

  return notify;
}
