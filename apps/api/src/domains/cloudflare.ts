/**
 * Cloudflare for SaaS custom hostnames (ADR 0025): the owner's domain is registered on the forms
 * zone, Cloudflare checks it through the owner's CNAME and issues its certificate.
 */
const API = "https://api.cloudflare.com/client/v4";

export type DomainStatus = "pending" | "active" | "failed";

export interface HostnameState {
  id: string;
  status: DomainStatus;
  /** What Cloudflare reports while it is not active, for the owner; null once active. */
  detail: string | null;
}

/** Why Cloudflare refused to register a hostname. */
export class CustomHostnameError extends Error {
  constructor(readonly code: "hostname_taken" | "hostname_rejected" | "cloudflare_unavailable") {
    super(code);
  }
}

interface ApiHostname {
  id: string;
  status?: string;
  verification_errors?: string[];
  ssl?: { status?: string; validation_errors?: { message?: string }[] };
}

interface ApiResponse<T> {
  success: boolean;
  result?: T;
  errors?: { code?: number; message?: string }[];
}

/** Hostname states after which Cloudflare will not continue on its own. */
const FAILED = new Set([
  "moved",
  "blocked",
  "pending_blocked",
  "deleted",
  "test_failed",
  "test_blocked",
]);
const SSL_FAILED = new Set(["validation_timed_out", "issuance_timed_out", "deleted", "expired"]);

export function stateOf(h: ApiHostname): HostnameState {
  const status = h.status ?? "pending";
  const ssl = h.ssl?.status ?? "initializing";
  if (status === "active" && ssl === "active") return { id: h.id, status: "active", detail: null };
  const reason = h.verification_errors?.[0] ?? h.ssl?.validation_errors?.[0]?.message;
  return {
    id: h.id,
    status: FAILED.has(status) || SSL_FAILED.has(ssl) ? "failed" : "pending",
    detail: (reason ?? `${status.replace(/_/g, " ")}, certificate ${ssl.replace(/_/g, " ")}`).slice(
      0,
      300,
    ),
  };
}

export interface CustomHostnames {
  create(hostname: string): Promise<HostnameState>;
  /** Null when Cloudflare no longer has it. */
  get(id: string): Promise<HostnameState | null>;
  remove(id: string): Promise<void>;
}

export function customHostnames(
  fetchFn: typeof fetch,
  zoneId: string,
  token: string,
): CustomHostnames {
  const base = `${API}/zones/${encodeURIComponent(zoneId)}/custom_hostnames`;
  const call = async <T>(url: string, init: RequestInit = {}) => {
    let res: Response;
    try {
      res = await fetchFn(url, {
        ...init,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      });
    } catch (err) {
      console.error("cloudflare_api_unreachable", err instanceof Error ? err.message : "unknown");
      throw new CustomHostnameError("cloudflare_unavailable");
    }
    const body = (await res.json().catch(() => ({ success: false }))) as ApiResponse<T>;
    return { res, body };
  };

  return {
    async create(hostname) {
      const { res, body } = await call<ApiHostname>(base, {
        method: "POST",
        body: JSON.stringify({
          hostname,
          ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } },
        }),
      });
      if (body.success && body.result) return stateOf(body.result);
      // 1406: the hostname is already registered (here or by another Cloudflare customer).
      if (body.errors?.some((e) => e.code === 1406))
        throw new CustomHostnameError("hostname_taken");
      if (
        res.status >= 400 &&
        res.status < 500 &&
        res.status !== 401 &&
        res.status !== 403 &&
        res.status !== 429
      )
        throw new CustomHostnameError("hostname_rejected");
      console.error("cloudflare_custom_hostname_error", res.status, body.errors?.[0]?.code ?? 0);
      throw new CustomHostnameError("cloudflare_unavailable");
    },

    async get(id) {
      const { res, body } = await call<ApiHostname>(`${base}/${encodeURIComponent(id)}`);
      if (res.status === 404) return null;
      if (!body.success || !body.result) {
        console.error("cloudflare_custom_hostname_error", res.status, body.errors?.[0]?.code ?? 0);
        throw new CustomHostnameError("cloudflare_unavailable");
      }
      return stateOf(body.result);
    },

    async remove(id) {
      const { res, body } = await call(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!body.success && res.status !== 404) {
        console.error("cloudflare_custom_hostname_error", res.status, body.errors?.[0]?.code ?? 0);
        throw new CustomHostnameError("cloudflare_unavailable");
      }
    },
  };
}
