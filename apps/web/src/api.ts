/** Typed client for the API (docs/API.md). Same origin, so the session cookie goes along. */

export interface Me {
  user: { id: string; email: string; name: string | null };
  google: { status: "active" | "revoked" | "missing"; driveAccess: boolean };
}

export interface FormSummary {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  publishedVersion: number | null;
  updatedAt: number;
  /** Only in the list: delivery to the sheet needs the owner's action. */
  needsAttention?: boolean;
}

export interface FormView extends FormSummary {
  draft: unknown;
  hasUnpublishedChanges: boolean;
  public: { url: string; embedCode: string } | null;
  destination: { state: DestinationState; url: string } | null;
}

export type DestinationState =
  "OK" | "ACCESS_REVOKED" | "SHEET_DELETED" | "TAB_MISSING" | "COLUMN_MISSING" | "QUOTA";

export interface Deliveries {
  destination: { state: DestinationState } | null;
  counts: Partial<Record<string, number>>;
}

export interface SchemaIssue {
  path: string;
  message: string;
}

/** A non-2xx answer. `code` is the API's `error` value. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown>,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    throw new ApiError(0, "network", {});
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(res.status, typeof body.error === "string" ? body.error : "unknown", body);
  }
  return body as T;
}

export const api = {
  me: () => request<Me>("/auth/me"),
  listForms: () => request<{ forms: FormSummary[] }>("/forms"),
  createForm: (title: string, template?: string) =>
    request<FormView>("/forms", { method: "POST", body: template ? { template } : { title } }),
  getForm: (id: string) => request<FormView>(`/forms/${id}`),
  saveDraft: (id: string, draft: unknown) =>
    request<FormView>(`/forms/${id}/draft`, { method: "PUT", body: draft }),
  publish: (id: string) => request<FormView>(`/forms/${id}/publish`, { method: "POST" }),
  deliveries: (id: string) => request<Deliveries>(`/forms/${id}/deliveries`),
  resume: (id: string) =>
    request<{ resumed: number; more: boolean }>(`/forms/${id}/deliveries/resume`, {
      method: "POST",
    }),
  deleteForm: (id: string) => request<undefined>(`/forms/${id}`, { method: "DELETE" }),
  pickerConfig: () =>
    request<{ accessToken: string; apiKey: string; appId: string }>("/account/google/picker"),
  attachSpreadsheet: (id: string, spreadsheetId: string) =>
    request<FormView>(`/forms/${id}/destination`, { method: "POST", body: { spreadsheetId } }),
  disconnectGoogle: () =>
    request<{ disconnected: true; revokedAtGoogle: boolean }>("/account/google/disconnect", {
      method: "POST",
    }),
  deleteAccount: (confirm: string) =>
    request<{ deleted: true; revokedAtGoogle: boolean }>("/account", {
      method: "DELETE",
      body: { confirm },
    }),
};

export const SIGN_IN_URL = "/auth/google/start";
export const GRANT_DRIVE_URL = "/auth/google/start?consent=1";
