import { refreshAccessToken } from "./client";
import { ApiError, NETWORK_MESSAGE, SESSION_EXPIRED_MESSAGE, failureMessage } from "./errors";
import { session } from "./session";

// Binary transfers (CSV exports, QR SVGs, image uploads) that the JSON-only
// request() helper cannot carry. Same bearer handling: renew once on a 401.

type Query = Record<string, string | number | undefined>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `${path}?${encoded}` : path;
}

async function send(url: string, init: RequestInit, token: string): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    return await fetch(url, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, 0, "network");
  }
}

async function failure(response: Response): Promise<ApiError> {
  let code: string | undefined;
  try {
    const body = (await response.json()) as { detail?: { code?: unknown } | string; code?: unknown };
    if (body.detail && typeof body.detail === "object" && typeof body.detail.code === "string") code = body.detail.code;
    else if (typeof body.code === "string") code = body.code;
  } catch {
    code = undefined;
  }
  return new ApiError(failureMessage(code, response.status), response.status, code);
}

async function authorized(url: string, init: RequestInit = {}): Promise<Response> {
  const token = session.token;
  let response = await send(url, init, token);
  if (response.status === 401 && token) {
    const renewed = await refreshAccessToken();
    if (!renewed) {
      session.expire();
      throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, "session_expired");
    }
    response = await send(url, init, renewed);
  }
  if (!response.ok) throw await failure(response);
  return response;
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

export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

export async function requestBlob(path: string, fallbackName: string, query?: Query): Promise<DownloadedFile> {
  const response = await authorized(withQuery(path, query));
  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get("Content-Disposition")) ?? fallbackName,
  };
}

export function saveFile(file: DownloadedFile): void {
  saveBlob(file.blob, file.filename);
}

export async function fetchBlob(path: string, query?: Query): Promise<Blob> {
  const response = await authorized(withQuery(path, query));
  return response.blob();
}

// Hands a blob to the browser as a file download.
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadFile(path: string, fallbackName: string, query?: Query): Promise<void> {
  saveFile(await requestBlob(path, fallbackName, query));
}

// Sends a file as the raw request body (no multipart), as the backend's
// upload endpoints expect, and returns the JSON answer.
export async function uploadFile<T>(path: string, file: File, query?: Query): Promise<T> {
  const response = await authorized(withQuery(path, query), {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream", Accept: "application/json" },
    body: file,
  });
  return (await response.json()) as T;
}
