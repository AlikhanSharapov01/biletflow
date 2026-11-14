// The request helper every feature module uses, with the same signature as the
// web client's request(): paths start with /api/v1, JSON in and out, and
// failures become ApiError with a readable message (api/errors.ts).
//
// Differences from the web: the access and refresh tokens live in the device
// keychain (tokenStorage), and the API origin comes from EXPO_PUBLIC_API_URL.

import { API_URL } from "@/api/client";
import { ApiError, NETWORK_MESSAGE, SESSION_EXPIRED_MESSAGE, failureMessage } from "@/api/errors";
import { expireSession, refreshAccessToken } from "@/api/session";
import { getTokens } from "@/api/tokenStorage";

// EXPO_PUBLIC_API_URL ends in /api/v1; feature modules write full paths.
export const API_ORIGIN = API_URL.replace(/\/api\/v1\/?$/, "");

export type Query = Record<string, string | number | undefined>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  idempotencyKey?: string;
}

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  if (!encoded) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${encoded}`;
}

export function apiUrl(path: string, query?: Query): string {
  const absolute = /^https?:\/\//.test(path);
  return withQuery(absolute ? path : `${API_ORIGIN}${path}`, query);
}

interface ErrorBody {
  detail?: { code?: unknown } | string;
  code?: unknown;
}

export function errorCode(body: unknown): string | undefined {
  const candidate = body as ErrorBody | null;
  if (candidate && typeof candidate.detail === "object" && candidate.detail) {
    if (typeof candidate.detail.code === "string") return candidate.detail.code;
  }
  if (candidate && typeof candidate.code === "string") return candidate.code;
  return undefined;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

// Turns a non-2xx answer into an ApiError (reads the body once).
export async function apiFailure(response: Response): Promise<ApiError> {
  const code = errorCode(await parseBody(response));
  return new ApiError(failureMessage(code, response.status), response.status, code);
}

async function send(url: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  for (const [key, value] of Object.entries((init.headers as Record<string, string>) ?? {})) {
    headers[key] = value;
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(url, { ...init, headers });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, 0, "network");
  }
}

// fetch() against the API with the stored bearer token (if any). On a 401 it
// renews the token once and retries; a session that cannot be renewed signs
// the user out and throws session_expired. Anonymous calls carry no token.
export async function authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { accessToken } = await getTokens();
  const response = await send(url, init, accessToken);
  if (response.status !== 401 || !accessToken) return response;

  const renewed = await refreshAccessToken();
  if (!renewed) {
    await expireSession();
    throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, "session_expired");
  }
  return send(url, init, renewed);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  const response = await authorizedFetch(apiUrl(path, options.query), init);
  const body = await parseBody(response);
  if (!response.ok) {
    const code = errorCode(body);
    throw new ApiError(failureMessage(code, response.status), response.status, code);
  }
  return body as T;
}
