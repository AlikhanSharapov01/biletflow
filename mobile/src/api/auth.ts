// Wire contract confirmed against the real implementation on origin/dauka-backend
// (backend/app/main.py, security.py, schemas.py, tests/test_auth.py) — not the
// earlier assumed spec. Field names below are exactly what the API sends/expects.

import { API_URL, friendlyError as baseFriendlyError, networkError } from "@/api/client";

export type TokenPair = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  refresh_token: string;
};

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  locale: string;
  email_verified_at: string | null;
  analytics_consent: boolean;
};

// Same wording as the web sign-in page (web/src/main.js parseResponse).
const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don’t match.",
  email_not_verified: "Please verify your email before signing in.",
  invalid_input: "Check your details and try again.",
  database_unavailable: "The service is temporarily unavailable. Please try again shortly.",
  suspended_account: "This account is unavailable. Contact support if you think this is a mistake.",
};

function friendlyError(response: Response): Promise<Error> {
  return baseFriendlyError(response, AUTH_MESSAGES);
}

// The mobile ticket-verification app is always a "scanner" client: it gets its
// refresh token back in the response body (protected device storage), unlike a
// "web" client, which gets it as an httponly cookie instead.
export async function login(email: string, password: string): Promise<TokenPair> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, client_kind: "scanner" }),
    });
  } catch {
    throw networkError();
  }

  if (!response.ok) {
    throw await friendlyError(response);
  }

  return response.json() as Promise<TokenPair>;
}

// Always answers 202, whether or not the email is already registered, so it
// can't be used to discover accounts. The verification link arrives by email.
export async function register(
  email: string,
  password: string,
  displayName: string
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, display_name: displayName, locale: "en" }),
    });
  } catch {
    throw networkError();
  }

  if (!response.ok) {
    throw await friendlyError(response);
  }
}

// Sends a reset link if the account is eligible; the answer never says whether
// the email exists.
export async function forgotPassword(email: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/password/forgot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw networkError();
  }

  if (!response.ok) {
    throw await friendlyError(response);
  }
}

// Login alone returns only tokens, never the user's profile — this is the one
// call that does.
export async function getProfile(accessToken: string): Promise<Profile> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw networkError();
  }

  if (!response.ok) {
    throw await friendlyError(response);
  }

  return response.json() as Promise<Profile>;
}

// Refresh tokens rotate on every use: the backend returns a brand new
// refresh_token and immediately invalidates the one just spent. The caller
// must persist the new pair before doing anything else with it — replaying
// an old refresh token revokes the whole session server-side.
export async function refresh(refreshToken: string): Promise<TokenPair> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    throw networkError();
  }

  if (!response.ok) {
    throw await friendlyError(response);
  }

  return response.json() as Promise<TokenPair>;
}

export async function logout(accessToken: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw networkError();
  }

  if (!response.ok) {
    throw await friendlyError(response);
  }
}
