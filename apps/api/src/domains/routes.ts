/**
 * An owner's custom domain (ADR 0025): one hostname per owner, registered with Cloudflare for SaaS.
 * Only the owner manages it; forms then also open at `https://<hostname>/<slug or form ID>`.
 */
import { Hono } from "hono";
import type { Deps, Env } from "../env.js";
import { requireUser, type OwnerEnv } from "../require-user.js";
import { CustomHostnameError, customHostnames, type DomainStatus } from "./cloudflare.js";

/** Pending checks older than this ask Cloudflare again when the owner looks. */
const RECHECK_MS = 15_000;
/** A hostname that never got its CNAME is released after this, so it cannot be squatted. */
export const PENDING_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export interface DomainRow {
  owner_id: string;
  hostname: string;
  cf_id: string;
  status: DomainStatus;
  detail: string | null;
  checked_at: number;
  created_at: number;
}

export function domainsEnabled(env: Env): boolean {
  return Boolean(
    env.CF_ZONE_ID &&
    env.CF_CUSTOM_HOSTNAMES_TOKEN &&
    env.CUSTOM_DOMAIN_TARGET &&
    env.FORMS_HOST &&
    env.APP_ORIGIN,
  );
}

export const hostnamesClient = (env: Env, deps: Deps) =>
  customHostnames(deps.fetch, env.CF_ZONE_ID ?? "", env.CF_CUSTOM_HOSTNAMES_TOKEN ?? "");

/** Hosts this service answers on itself, which can never be someone's custom domain. */
export function isOwnHost(env: Env, host: string): boolean {
  const app = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).hostname : null;
  const forms = env.FORMS_HOST;
  return (
    (forms !== undefined && (host === forms || host.endsWith(`.${forms}`))) ||
    (app !== null && (host === app || host === `www.${app}`))
  );
}

/** The hostname as stored (lowercase, no scheme or path), or why it can't be used. */
export function normalizeHostname(
  env: Env,
  input: string,
): { hostname: string } | { problem: string } {
  let host = input.trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return { problem: "invalid_hostname" };
    }
  }
  host = host.replace(/\/+$/, "").replace(/\.$/, "");
  const labels = host.split(".");
  if (
    host.length > 253 ||
    labels.length < 2 ||
    !labels.every((l) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l)) ||
    !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(labels[labels.length - 1] ?? "")
  ) {
    return { problem: "invalid_hostname" };
  }
  if (isOwnHost(env, host)) return { problem: "hostname_not_allowed" };
  return { hostname: host };
}

const view = (env: Env, row: DomainRow | null) => ({
  available: true,
  target: env.CUSTOM_DOMAIN_TARGET,
  domain: row && {
    hostname: row.hostname,
    status: row.status,
    detail: row.detail,
    checkedAt: row.checked_at,
  },
});

/** Asks Cloudflare for the current state and stores it; a hostname Cloudflare lost is failed. */
export async function refreshDomain(env: Env, deps: Deps, row: DomainRow): Promise<DomainRow> {
  const state = await hostnamesClient(env, deps).get(row.cf_id);
  const now = deps.now();
  const next: DomainRow = {
    ...row,
    status: state?.status ?? "failed",
    detail: state
      ? state.detail
      : "Cloudflare no longer has this domain. Remove it and add it again.",
    checked_at: now,
  };
  await env.DB.prepare(
    "UPDATE custom_domains SET status = ?, detail = ?, checked_at = ? WHERE owner_id = ? AND cf_id = ?",
  )
    .bind(next.status, next.detail, now, row.owner_id, row.cf_id)
    .run();
  return next;
}

export function domainRoutes(deps: Deps): Hono<OwnerEnv> {
  const domain = new Hono<OwnerEnv>();
  domain.use(requireUser(deps));
  domain.use(async (c, next) => {
    if (!domainsEnabled(c.env)) return c.json({ available: false, domain: null });
    c.header("Cache-Control", "no-store");
    await next();
  });

  const current = (c: { env: Env; var: { user: { id: string } } }) =>
    c.env.DB.prepare("SELECT * FROM custom_domains WHERE owner_id = ?")
      .bind(c.var.user.id)
      .first<DomainRow>();

  domain.get("/", async (c) => {
    let row = await current(c);
    if (row && row.status !== "active" && deps.now() - row.checked_at > RECHECK_MS) {
      row = await refreshDomain(c.env, deps, row).catch(() => row);
    }
    return c.json(view(c.env, row));
  });

  domain.put("/", async (c) => {
    const body = await c.req.json<{ hostname?: unknown }>().catch(() => ({ hostname: undefined }));
    if (typeof body.hostname !== "string") return c.json({ error: "invalid_hostname" }, 422);
    const normalized = normalizeHostname(c.env, body.hostname);
    if ("problem" in normalized) return c.json({ error: normalized.problem }, 422);
    if (await current(c)) return c.json({ error: "domain_exists" }, 409);
    const taken = await c.env.DB.prepare("SELECT 1 FROM custom_domains WHERE hostname = ?")
      .bind(normalized.hostname)
      .first();
    if (taken) return c.json({ error: "hostname_taken" }, 409);
    try {
      const state = await hostnamesClient(c.env, deps).create(normalized.hostname);
      const now = deps.now();
      await c.env.DB.prepare(
        `INSERT INTO custom_domains (owner_id, hostname, cf_id, status, detail, checked_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(c.var.user.id, normalized.hostname, state.id, state.status, state.detail, now, now)
        .run();
      return c.json(view(c.env, await current(c)), 201);
    } catch (err) {
      if (err instanceof CustomHostnameError) {
        const status = {
          hostname_taken: 409,
          hostname_rejected: 422,
          cloudflare_unavailable: 502,
        } as const;
        return c.json({ error: err.code }, status[err.code]);
      }
      throw err;
    }
  });

  domain.delete("/", async (c) => {
    const row = await current(c);
    if (row) {
      try {
        await hostnamesClient(c.env, deps).remove(row.cf_id);
      } catch {
        return c.json({ error: "cloudflare_unavailable" }, 502);
      }
      await c.env.DB.prepare("DELETE FROM custom_domains WHERE owner_id = ?")
        .bind(c.var.user.id)
        .run();
    }
    return c.json(view(c.env, null));
  });

  return domain;
}

/** Pending domains asked about per hourly run. */
const REFRESH_PER_RUN = 10;

/**
 * Hourly: domains still pending are checked with Cloudflare (so they work even if the owner never
 * reopens the page), and ones that never got their CNAME within a week are released.
 */
export async function maintainDomains(env: Env, deps: Deps, now: number): Promise<void> {
  if (!domainsEnabled(env)) return;
  const { results } = await env.DB.prepare(
    "SELECT * FROM custom_domains WHERE status != 'active' ORDER BY checked_at LIMIT ?",
  )
    .bind(REFRESH_PER_RUN)
    .all<DomainRow>();
  for (const row of results) {
    try {
      if (now - row.created_at > PENDING_EXPIRY_MS) {
        await hostnamesClient(env, deps).remove(row.cf_id);
        await env.DB.prepare("DELETE FROM custom_domains WHERE owner_id = ? AND cf_id = ?")
          .bind(row.owner_id, row.cf_id)
          .run();
      } else {
        await refreshDomain(env, deps, row);
      }
    } catch {
      // Cloudflare is unreachable: next hour.
    }
  }
}
