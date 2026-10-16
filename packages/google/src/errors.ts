/**
 * Error classes for Google calls, aligned with ADR 0005 destination states and ADR 0008 retry
 * classes. Messages never include tokens or response bodies.
 */
export type GoogleErrorKind =
  /** OAuth grant revoked/expired or the app lost access to the file. Owner must act. */
  | "ACCESS_REVOKED"
  /** Spreadsheet trashed or deleted. Owner must act. */
  | "SHEET_DELETED"
  /** Target tab no longer exists. Owner must act. */
  | "TAB_MISSING"
  /** A required column (with its developer metadata) was deleted. Owner must act. */
  | "COLUMN_MISSING"
  /** Rate limit: retry with backoff. */
  | "QUOTA"
  /** Server error or network failure: retry with backoff. */
  | "TRANSIENT"
  /** Request was invalid: a bug or a configuration problem, not retried automatically. */
  | "INVALID_REQUEST";

export class GoogleApiError extends Error {
  override readonly name = "GoogleApiError";
  constructor(
    readonly kind: GoogleErrorKind,
    readonly status: number,
    /** Google's machine-readable reason, if any (e.g. `rateLimitExceeded`). */
    readonly reason?: string,
    /** Google's error message (describes the request, never contains user data we sent). */
    readonly detail?: string,
  ) {
    super(`${kind} (${String(status)}${reason ? `: ${reason}` : ""})`);
  }

  /** True when retrying later may succeed without the owner doing anything. */
  get retryable(): boolean {
    return this.kind === "QUOTA" || this.kind === "TRANSIENT";
  }
}

interface GoogleErrorBody {
  error?:
    | string
    | {
        status?: string;
        message?: string;
        errors?: { reason?: string }[];
        details?: { reason?: string }[];
      };
}

export async function errorFromResponse(res: Response): Promise<GoogleApiError> {
  let reason: string | undefined;
  let detail: string | undefined;
  try {
    const body = (await res.json()) as GoogleErrorBody;
    if (typeof body.error === "string") reason = body.error;
    else {
      reason =
        body.error?.errors?.[0]?.reason ?? body.error?.details?.[0]?.reason ?? body.error?.status;
      detail = body.error?.message;
    }
  } catch {
    // Non-JSON error bodies carry no extra information we need.
  }
  const { status } = res;
  if (
    status === 429 ||
    reason === "rateLimitExceeded" ||
    reason === "userRateLimitExceeded" ||
    reason === "RATE_LIMIT_EXCEEDED"
  ) {
    return new GoogleApiError("QUOTA", status, reason);
  }
  if (status >= 500) return new GoogleApiError("TRANSIENT", status, reason);
  if (status === 401 || status === 403 || reason === "invalid_grant") {
    return new GoogleApiError("ACCESS_REVOKED", status, reason);
  }
  if (status === 404) return new GoogleApiError("SHEET_DELETED", status, reason);
  if (status === 400 && detail !== undefined && /no grid with id/i.test(detail)) {
    return new GoogleApiError("TAB_MISSING", status, reason, detail);
  }
  return new GoogleApiError("INVALID_REQUEST", status, reason, detail);
}
