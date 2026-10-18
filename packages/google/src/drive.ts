/**
 * The Drive calls file uploads need (ADR 0007), all within the `drive.file` scope: the app only
 * sees folders and files it created.
 */
import { errorFromResponse, GoogleApiError } from "./errors.js";

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_TYPE = "application/vnd.google-apps.folder";

/** What the app writes on each uploaded file so the delivery can recognise it. */
export interface UploadTags {
  freelyForm: string;
  freelyField: string;
  freelyToken: string;
  freelyAttached: "0" | "1";
}

export interface DriveFile {
  id: string;
  name: string;
  size?: string;
  mimeType: string;
  parents?: string[];
  appProperties?: Partial<UploadTags>;
}

export interface DriveClient {
  createFolder(name: string): Promise<string>;
  /** A resumable session for a browser on `origin`; returns the session URI (a secret). */
  createUploadSession(args: {
    folderId: string;
    name: string;
    size: number;
    mimeType: string;
    origin: string;
    tags: UploadTags;
  }): Promise<string>;
  getFile(id: string): Promise<DriveFile | null>;
  markAttached(id: string): Promise<void>;
  /** Files in a folder still marked unattached and created before `before` (ISO time). */
  staleUploads(folderId: string, before: string): Promise<string[]>;
  deleteFile(id: string): Promise<void>;
}

export function driveClient(fetchFn: typeof fetch, accessToken: string): DriveClient {
  const auth = { authorization: `Bearer ${accessToken}` };
  const call = async (url: string, init: RequestInit = {}): Promise<Response> => {
    let res: Response;
    try {
      const headers = new Headers(init.headers);
      headers.set("authorization", auth.authorization);
      res = await fetchFn(url, { ...init, headers });
    } catch {
      throw new GoogleApiError("TRANSIENT", 0, "network");
    }
    return res;
  };
  const json = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
    const res = await call(url, init);
    if (!res.ok) throw await errorFromResponse(res);
    return (await res.json()) as T;
  };

  return {
    async createFolder(name) {
      const folder = await json<{ id: string }>(`${DRIVE}?fields=id`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, mimeType: FOLDER_TYPE }),
      });
      return folder.id;
    },

    async createUploadSession({ folderId, name, size, mimeType, origin, tags }) {
      const res = await call(`${UPLOAD}?uploadType=resumable&fields=id,name,size,mimeType`, {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=UTF-8",
          "x-upload-content-type": mimeType,
          "x-upload-content-length": String(size),
          // CORS: the browser on this origin may then PUT the bytes itself.
          origin,
        },
        body: JSON.stringify({ name, parents: [folderId], appProperties: tags }),
      });
      if (!res.ok) throw await errorFromResponse(res);
      const location = res.headers.get("location");
      if (!location) throw new GoogleApiError("TRANSIENT", res.status, "no_upload_location");
      return location;
    },

    async getFile(id) {
      const res = await call(
        `${DRIVE}/${encodeURIComponent(id)}?fields=id,name,size,mimeType,parents,appProperties`,
      );
      if (res.status === 404) return null;
      if (!res.ok) throw await errorFromResponse(res);
      return (await res.json()) as DriveFile;
    },

    async markAttached(id) {
      await json(`${DRIVE}/${encodeURIComponent(id)}?fields=id`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appProperties: { freelyAttached: "1" } }),
      });
    },

    async staleUploads(folderId, before) {
      const q = [
        `'${folderId}' in parents`,
        "trashed = false",
        "appProperties has { key='freelyAttached' and value='0' }",
        `createdTime < '${before}'`,
      ].join(" and ");
      const list = await json<{ files?: { id: string }[] }>(
        `${DRIVE}?pageSize=100&fields=files(id)&q=${encodeURIComponent(q)}`,
      );
      return (list.files ?? []).map((f) => f.id);
    },

    async deleteFile(id) {
      const res = await call(`${DRIVE}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw await errorFromResponse(res);
    },
  };
}

export const driveFileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;
