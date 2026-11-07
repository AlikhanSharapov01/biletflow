// Mirrors backend/app/schemas.py (accounts, sessions, tokens).
import type { Locale } from "./common";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  locale: Locale;
  email_verified_at: string | null;
  analytics_consent: boolean;
}

export interface ProfileUpdate {
  display_name?: string;
  locale?: Locale;
  analytics_consent?: boolean;
}

export interface SessionView {
  id: string;
  client_kind: "web" | "scanner";
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
}

export interface TokenPair {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string | null;
}

export interface AuthorizationURL {
  authorization_url: string;
}
