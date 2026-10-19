/**
 * The unsubscribe link in notification emails (ADR 0026). Opening it shows a button: mail
 * scanners that follow links must not turn notifications off; only the POST does.
 */
import { Hono, type Context } from "hono";
import { html } from "hono/html";
import type { Env } from "../env.js";
import { siteCsp, sitePage, type Html } from "../site/layout.js";
import { siteContext } from "../site/routes.js";
import { validUnsubscribe } from "./notify.js";

type Ctx = Context<{ Bindings: Env }>;

/** A website page with one card; its form may post back to this origin only. */
const page = (c: Ctx, title: string, body: Html, status: 200 | 404 = 200) => {
  const ctx = siteContext(c);
  c.header("Content-Security-Policy", siteCsp(ctx.nonce, "'self'"));
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
  return c.html(
    sitePage(
      { ...ctx, indexable: false },
      { title: `${title} · Freely Forms`, description: title, path: "/notifications/off" },
      html`<section>
        <div class="wrap narrow">
          <div class="card notice">
            <h1>${title}</h1>
            ${body}
          </div>
        </div>
      </section>`,
    ),
    status,
  );
};

const invalid = html`<p class="muted">
    This link is not valid. Use the latest link from a notification email, or turn emails off on the
    form's Publish tab.
  </p>
  <div class="actions"><a class="btn" href="/app/">Open Freely Forms</a></div>`;

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
      return page(c, "Link not valid", invalid, 404);
    }
    const title = await c.env.DB.prepare("SELECT title FROM forms WHERE id = ?")
      .bind(form)
      .first<string>("title");
    return page(
      c,
      "Turn off emails for this form?",
      html`${title ? html`<p><strong>${title}</strong></p>` : ""}
        <p class="muted">
          You will no longer get an email when this form receives responses. You can turn them on
          again on the form's Publish tab.
        </p>
        <form method="post" class="actions">
          <input type="hidden" name="form" value="${form}" />
          <input type="hidden" name="token" value="${token}" />
          <button type="submit" class="btn primary">Turn off emails</button>
          <a class="btn" href="/app/forms/${form}">Keep them on</a>
        </form>`,
    );
  });

  notify.post("/off", async (c) => {
    const body = await c.req.parseBody();
    const form = typeof body.form === "string" ? body.form : "";
    const token = typeof body.token === "string" ? body.token : "";
    if (!(await checked(c, form, token))) {
      return page(c, "Link not valid", invalid, 404);
    }
    await c.env.DB.prepare("DELETE FROM form_notifications WHERE form_id = ?").bind(form).run();
    return page(
      c,
      "Emails turned off",
      html`<p class="muted">
          You will no longer get emails for this form. To turn them on again, open the form's
          Publish tab.
        </p>
        <div class="actions"><a class="btn" href="/app/forms/${form}">Open the form</a></div>`,
    );
  });

  return notify;
}
