/** Days an undelivered payload may be held before it is deleted (ADR 0008). */
export const PAYLOAD_RETENTION_DAYS = 7;
export const PAYLOAD_RETENTION_MS = PAYLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const DELIVERY_STATES = [
  "accepted",
  "queued",
  "delivering",
  "delivered",
  "retrying",
  "unknown",
  "blocked",
  "permanently_failed",
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export const DESTINATION_STATES = [
  "OK",
  "ACCESS_REVOKED",
  "SHEET_DELETED",
  "TAB_MISSING",
  "COLUMN_MISSING",
  "QUOTA",
] as const;
export type DestinationState = (typeof DESTINATION_STATES)[number];
