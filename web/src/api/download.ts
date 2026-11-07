import { refreshAccessToken } from "./client";
import { ApiError, NETWORK_MESSAGE, SESSION_EXPIRED_MESSAGE, failureMessage } from "./errors";
import { session } from "./session";

// Binary downloads (ticket PDF, calendar file). Same bearer token and one-time
// refresh as request(), but the body is returned as a Blob.

export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

async function send(path: string, token: string): Promise<Response> {
  const headers = new Headers({ Accept: "*/*" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    return await fetch(path, { method: "GET", headers, credentials: "include" });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, 0, "network");
  }
}

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { detail?: { code?: unknown } | string; code?: unknown };
    if (body.detail && typeof body.detail === "object" && typeof body.detail.code === "string") return body.detail.code;
    if (typeof body.code === "string") return body.code;
  } catch {
    // Not JSON: fall back to the status message.
  }
  return undefined;
}

// `attachment; filename="biletflow-ticket-1.pdf"` -> "biletflow-ticket-1.pdf".
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // Fall through to the plain filename.
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || null;
}

export async function requestBlob(path: string, fallbackName: string): Promise<DownloadedFile> {
  const token = session.token;
  let response = await send(path, token);
  if (response.status === 401 && token) {
    const renewed = await refreshAccessToken();
    if (!renewed) {
      session.expire();
      throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, "session_expired");
    }
    response = await send(path, renewed);
  }
  if (!response.ok) {
    const code = await errorCode(response);
    throw new ApiError(failureMessage(code, response.status), response.status, code);
  }
  const blob = await response.blob();
  return { blob, filename: filenameFromDisposition(response.headers.get("Content-Disposition")) ?? fallbackName };
}

// Hands a downloaded file to the browser's save dialog.
export function saveFile(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
