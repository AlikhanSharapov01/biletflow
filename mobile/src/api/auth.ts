// Wire contract confirmed against the real implementation on origin/dauka-backend
// (backend/app/main.py, security.py, schemas.py, tests/test_auth.py) — not the
// earlier assumed spec. Field names below are exactly what the API sends/expects.

// Base already includes /api/v1 — matches the root README's documented
// convention for configuring the mobile client (see "Work on the mobile
// client"), e.g. EXPO_PUBLIC_API_URL=http://192.168.1.20:8080/api/v1 to go
// through the Caddy proxy from a physical device on the same network.
// `localhost` resolves to the device itself, not your dev machine, on a
// physical phone or an Android emulator — override accordingly:
// Android emulator -> http://10.0.2.2:8000/api/v1, physical device -> your
// machine's LAN IP, ideally through Caddy on :8080 rather than the API's
// direct :8000 (matches how the web client reaches it too).
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

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

type ErrorBody = {
  detail?: {
    code?: string;
    fields?: unknown[];
  };
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  invalid_input: "Please check your email and password and try again.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
};

async function friendlyError(response: Response): Promise<Error> {
  let body: ErrorBody | undefined;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const code = body?.detail?.code;
  const message =
    (code && ERROR_MESSAGES[code]) ??
    `Something went wrong (${response.status}). Please try again.`;
  return new Error(message);
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
    throw new Error("Couldn't reach the server. Check your connection and try again.");
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
    throw new Error("Couldn't reach the server. Check your connection and try again.");
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
    throw new Error("Couldn't reach the server. Check your connection and try again.");
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
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    throw await friendlyError(response);
  }
}
