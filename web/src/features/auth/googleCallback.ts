// Google redirects back to the web root with `code` and `state` (or `error`).
// The backend may also redirect here with `#access_token=` or `?google_error=`.
// This reads those once, removes them from the address bar, and reports what
// it found so AuthProvider can finish the sign-in.

export type GoogleCallback =
  | { kind: "none" }
  | { kind: "token"; token: string }
  | { kind: "backend_error"; code: string }
  | { kind: "provider_error"; error: string; state: string | null }
  | { kind: "code"; code: string; state: string }
  | { kind: "incomplete" };

const PROVIDER_PARAMS = ["code", "state", "error", "scope", "authuser", "prompt"];

export function consumeGoogleCallback(location: Location = window.location, history: History = window.history): GoogleCallback {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const token = fragment.get("access_token");
  const backendError = url.searchParams.get("google_error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  const touched = Boolean(token || backendError || code || state || providerError);
  if (!touched) return { kind: "none" };

  url.hash = "";
  url.searchParams.delete("google_error");
  for (const key of PROVIDER_PARAMS) url.searchParams.delete(key);
  history.replaceState(null, "", `${url.pathname}${url.search}`);

  if (providerError) return { kind: "provider_error", error: providerError, state };
  if (code || state) {
    if (code && state) return { kind: "code", code, state };
    return { kind: "incomplete" };
  }
  if (backendError) return { kind: "backend_error", code: backendError };
  if (token) return { kind: "token", token };
  return { kind: "none" };
}
