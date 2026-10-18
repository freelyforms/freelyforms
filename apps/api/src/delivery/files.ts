/**
 * Uploaded files at delivery time (ADR 0007): each `<fileId>:<token>` answer is checked in the
 * owner's Drive before its link goes into the sheet, then marked attached so the clean-up keeps it.
 */
import type { AnswerValue } from "@freelyforms/form-engine";
import { answerFields, type Field, type Form } from "@freelyforms/form-schema";
import { DEFAULT_FILE_MAX_MB } from "@freelyforms/form-schema/limits";
import { driveFileUrl, type DriveClient } from "@freelyforms/google";
import { acceptsType } from "../public/uploads.js";

type FileField = Extract<Field, { type: "file" }>;

const fileFields = (form: Form) =>
  answerFields(form).filter((f): f is FileField => f.type === "file");

const answersOf = (value: AnswerValue | undefined): string[] =>
  Array.isArray(value) ? (value as readonly string[]).filter((v) => v !== "") : [];

/** How many uploaded files a response carries. */
export function fileCount(form: Form, values: Readonly<Record<string, AnswerValue>>): number {
  return fileFields(form).reduce((n, f) => n + answersOf(values[f.id]).length, 0);
}

/**
 * The values with each file field replaced by what its cell shows: `name – link` per file that
 * really was uploaded through this form and field, `(file not accepted)` otherwise.
 */
export async function attachFiles(
  drive: DriveClient,
  form: Form,
  values: Readonly<Record<string, AnswerValue>>,
): Promise<Record<string, AnswerValue>> {
  const out: Record<string, AnswerValue> = { ...values };
  for (const field of fileFields(form)) {
    const answers = answersOf(values[field.id]);
    if (answers.length === 0) continue;
    const lines: string[] = [];
    for (const answer of answers) {
      const [id = "", token = ""] = answer.split(":");
      const file = await drive.getFile(id);
      const tags = file?.appProperties;
      const ok =
        file !== null &&
        tags?.freelyForm === form.id &&
        tags.freelyField === field.id &&
        tags.freelyToken === token &&
        Number(file.size ?? 0) <= (field.maxSizeMb ?? DEFAULT_FILE_MAX_MB) * 1024 * 1024 &&
        acceptsType(field, file.mimeType);
      if (!ok) {
        lines.push("(file not accepted)");
        continue;
      }
      if (tags.freelyAttached !== "1") await drive.markAttached(id);
      lines.push(`${file.name} – ${driveFileUrl(id)}`);
    }
    out[field.id] = lines.join("\n");
  }
  return out;
}
