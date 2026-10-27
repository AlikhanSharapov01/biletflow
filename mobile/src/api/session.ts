// Authenticated requests that survive access-token expiry.
//
// Access tokens last ten minutes; a scanner sits on one screen far longer.
// On a 401 we refresh once and retry once. Refresh tokens rotate on every
// use and the backend revokes the whole session if an old one is replayed,
// so concurrent 401s must share a single refresh instead of each starting
// their own.

import { refresh } from "@/api/auth";
import { API_URL, friendlyError, networkError } from "@/api/client";
import { clearTokens, getTokens, saveTokens } from "@/api/tokenStorage";

export class SessionExpiredError extends Error {
  constructor() {
    super("Your session has expired. Please sign in again.");
    this.name = "SessionExpiredError";
  }
}

let onSessionExpired: (() => void) | null = null;

// AuthContext registers this so a dead session sends the user back to login.
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

let refreshing: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const { refreshToken } = await getTokens();
      if (!refreshToken) return null;
      try {
        const tokens = await refresh(refreshToken);
        await saveTokens(tokens.access_token, tokens.refresh_token);
        return tokens.access_token;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function expire(): Promise<never> {
  await clearTokens();
  onSessionExpired?.();
  throw new SessionExpiredError();
}

function send(path: string, init: RequestInit, accessToken: string): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
  }).catch(() => {
    throw networkError();
  });
}

// Like fetch, but against API_URL with the stored bearer token. Throws the
// shared network error when the server can't be reached, and signs the user
// out (then throws) when the session can't be renewed.
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { accessToken } = await getTokens();
  if (!accessToken) return expire();

  const response = await send(path, init, accessToken);
  if (response.status !== 401) return response;

  const renewed = await refreshAccessToken();
  if (!renewed) return expire();

  const retried = await send(path, init, renewed);
  if (retried.status === 401) return expire();
  return retried;
}

// A signed-in JSON request: non-2xx answers become friendly errors, using
// `messages` for codes this caller expects.
export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  messages: Record<string, string> = {}
): Promise<T> {
  const response = await authedFetch(path, init);
  if (!response.ok) {
    throw await friendlyError(response, messages);
  }
  return response.json() as Promise<T>;
}
