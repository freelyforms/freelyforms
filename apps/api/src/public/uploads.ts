import type { Field } from "@freelyforms/form-schema";
import {
  DEFAULT_FILE_MAX_MB,
  FILE_TYPES,
  MAX_SIGNATURE_BYTES,
} from "@freelyforms/form-schema/limits";

/** Fields whose answers are files in the owner's Drive: uploads and drawn signatures. */
export type FileField = Extract<Field, { type: "file" | "signature" }>;

export const maxBytes = (field: FileField) =>
  field.type === "signature"
    ? MAX_SIGNATURE_BYTES
    : (field.maxSizeMb ?? DEFAULT_FILE_MAX_MB) * 1024 * 1024;

/** Whether a file of this MIME type fits the field's `accept` setting (ADR 0007). */
export function acceptsType(field: FileField, type: string): boolean {
  if (field.type === "signature") return type === "image/png";
  const accept = field.accept ?? "any";
  return accept === "any" || (FILE_TYPES[accept] as readonly string[]).includes(type);
}

/** Why a file can't go into this field, or null. Shared by the upload slot and the delivery. */
export function uploadProblem(
  field: FileField,
  file: { size: number; type: string; name: string },
): "file_too_large" | "file_type" | "file_name" | null {
  if (!file.name) return "file_name";
  if (file.size <= 0 || file.size > maxBytes(field)) {
    return "file_too_large";
  }
  if (!acceptsType(field, file.type)) return "file_type";
  return null;
}
