// Google redirects back to the web root with `code` and `state` (or `error`).
// The backend may also redirect here with `?google_error=`. This reads those
// once, removes them from the address bar, and reports what it found so
// AuthProvider can finish the sign-in.
//
// A token in the URL (`#access_token=`) is never used: anyone can put one in a
// link, and signing in with it would silently switch the visitor into the
// link author's account (login CSRF). The backend's Google callback answers
// with JSON and never sends one, so it is only removed from the address bar.

export type GoogleCallback =
  | { kind: "none" }
  | { kind: "backend_error"; code: string }
  | { kind: "provider_error"; error: string; state: string | null }
  | { kind: "code"; code: string; state: string }
  | { kind: "incomplete" };

const PROVIDER_PARAMS = ["code", "state", "error", "scope", "authuser", "prompt"];

export function consumeGoogleCallback(location: Location = window.location, history: History = window.history): GoogleCallback {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const urlToken = fragment.has("access_token");
  const backendError = url.searchParams.get("google_error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  const touched = Boolean(urlToken || backendError || code || state || providerError);
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
  return { kind: "none" };
}
