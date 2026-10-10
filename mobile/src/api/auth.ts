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

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  invalid_input: "Please check your email and password and try again.",
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
