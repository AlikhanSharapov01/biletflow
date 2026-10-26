import { ApiError, NETWORK_MESSAGE, SESSION_EXPIRED_MESSAGE, failureMessage } from "./errors";
import { session } from "./session";
import type { TokenPair } from "./types";

const REFRESH_PATH = "/api/v1/auth/refresh";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

interface ErrorBody {
  detail?: { code?: unknown } | string;
  code?: unknown;
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

function errorCode(body: unknown): string | undefined {
  const candidate = body as ErrorBody | null;
  if (candidate && typeof candidate.detail === "object" && candidate.detail) {
    if (typeof candidate.detail.code === "string") return candidate.detail.code;
  }
  if (candidate && typeof candidate.code === "string") return candidate.code;
  return undefined;
}

function withQuery(path: string, query?: RequestOptions["query"]): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `${path}?${encoded}` : path;
}

async function send(path: string, options: RequestOptions, token: string): Promise<Response> {
  const headers = new Headers({ Accept: "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  try {
    return await fetch(withQuery(path, options.query), {
      method: options.method ?? "GET",
      headers,
      credentials: "include",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, 0, "network");
  }
}

let refreshInFlight: Promise<string | null> | null = null;

// Exchanges the refresh cookie for a new access token. Resolves to null when
// there is no usable session, which is the normal anonymous case.
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await send(REFRESH_PATH, { method: "POST", body: {} }, "");
      if (response.status === 401) return null;
      const body = await parseBody(response);
      if (!response.ok) {
        throw new ApiError(failureMessage(errorCode(body), response.status), response.status, errorCode(body));
      }
      const token = (body as TokenPair).access_token;
      session.set(token);
      return token;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

// Single entry point for every API call. Attaches the bearer token, renews it
// once on a 401, and converts failures into ApiError with a readable message.
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = session.token;
  let response = await send(path, options, token);

  if (response.status === 401 && token && path !== REFRESH_PATH) {
    const renewed = await refreshAccessToken();
    if (!renewed) {
      session.expire();
      throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, "session_expired");
    }
    response = await send(path, options, renewed);
  }

  const body = await parseBody(response);
  if (!response.ok) {
    const code = errorCode(body);
    throw new ApiError(failureMessage(code, response.status), response.status, code);
  }
  return body as T;
}
