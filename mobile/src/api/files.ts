// Binary transfers that request() cannot carry: ticket PDFs, calendar files,
// CSV exports, QR SVGs and uploads. A download is written to the app's cache
// and handed to the system share sheet, which is how a phone "saves" a file.

import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { apiFailure, apiUrl, authorizedFetch, type Query } from "@/api/http";

export interface DownloadedFile {
  uri: string;
  filename: string;
  mimeType: string;
}

// A file chosen on the device (document picker or image picker result).
export interface UploadFile {
  uri: string;
  name: string;
  mimeType?: string | null;
}

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

// Keeps a server-supplied name from escaping the cache folder.
export function safeFilename(name: string): string {
  const cleaned = name.replace(/[/\\?%*:|"<>]/g, "-").trim();
  return cleaned || "download";
}

async function fetchOk(path: string, query?: Query, init: RequestInit = {}): Promise<Response> {
  const response = await authorizedFetch(apiUrl(path, query), init);
  if (!response.ok) throw await apiFailure(response);
  return response;
}

export async function requestBlob(path: string, fallbackName: string, query?: Query): Promise<DownloadedFile> {
  const response = await fetchOk(path, query);
  const filename = safeFilename(filenameFromDisposition(response.headers.get("Content-Disposition")) ?? fallbackName);
  const mimeType = response.headers.get("Content-Type")?.split(";")[0] ?? "application/octet-stream";
  const bytes = new Uint8Array(await response.arrayBuffer());
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
  return { uri: file.uri, filename, mimeType };
}

// Opens the share sheet so the person can save, print or send the file.
export async function saveFile(file: DownloadedFile): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing files isn’t available on this device.");
  }
  await Sharing.shareAsync(file.uri, { mimeType: file.mimeType, dialogTitle: file.filename });
}

export async function downloadFile(path: string, fallbackName: string, query?: Query): Promise<void> {
  await saveFile(await requestBlob(path, fallbackName, query));
}

// Small text answers such as an SVG image.
export async function fetchText(path: string, query?: Query): Promise<string> {
  return (await fetchOk(path, query)).text();
}

// Sends the file as the raw request body (no multipart), as the backend's
// upload endpoints expect, and returns the JSON answer.
export async function uploadFile<T>(path: string, file: UploadFile, query?: Query): Promise<T> {
  const body = await (await fetch(file.uri)).blob();
  const response = await fetchOk(path, query, {
    method: "POST",
    headers: { "Content-Type": file.mimeType || "application/octet-stream" },
    body,
  });
  return (await response.json()) as T;
}
