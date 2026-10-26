import { request } from "./client";
import type { AuthorizationURL, Message, Profile, ProfileUpdate, SessionView, TokenPair } from "./types";

export interface Credentials {
  email: string;
  password: string;
}

export interface Registration extends Credentials {
  display_name: string;
  locale: "kk" | "ru" | "en";
}

export function login(credentials: Credentials): Promise<TokenPair> {
  return request<TokenPair>("/api/v1/auth/login", {
    method: "POST",
    body: { ...credentials, client_kind: "web" },
  });
}

export function register(data: Registration): Promise<Message> {
  return request<Message>("/api/v1/auth/register", { method: "POST", body: data });
}

export function resendVerification(email: string): Promise<Message> {
  return request<Message>("/api/v1/auth/verification/resend", { method: "POST", body: { email } });
}

// Token comes from the `#token=` fragment of the emailed link.
export function verifyEmail(token: string): Promise<Message> {
  return request<Message>("/api/v1/auth/verify-email", { method: "POST", body: { token } });
}

export function requestPasswordReset(email: string): Promise<Message> {
  return request<Message>("/api/v1/auth/password/forgot", { method: "POST", body: { email } });
}

export function resetPassword(token: string, password: string): Promise<Message> {
  return request<Message>("/api/v1/auth/password/reset", { method: "POST", body: { token, password } });
}

export function startGoogleSignIn(): Promise<AuthorizationURL> {
  return request<AuthorizationURL>("/api/v1/auth/google/start", { method: "POST" });
}

// Completes the Google redirect. With `error`, the backend records the denial
// and responds with the matching code instead of tokens.
export function completeGoogleSignIn(params: { code?: string; state: string; error?: string }): Promise<TokenPair> {
  return request<TokenPair>("/api/v1/auth/google/callback", { query: params });
}

export function logout(): Promise<unknown> {
  return request("/api/v1/auth/logout", { method: "POST" });
}

export function logoutEverywhere(): Promise<unknown> {
  return request("/api/v1/auth/logout-all", { method: "POST" });
}

export function listSessions(): Promise<SessionView[]> {
  return request<SessionView[]>("/api/v1/auth/sessions", { query: { limit: 50 } });
}

export function revokeSession(id: string): Promise<unknown> {
  return request(`/api/v1/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getProfile(): Promise<Profile> {
  return request<Profile>("/api/v1/me");
}

export function updateProfile(data: ProfileUpdate): Promise<Profile> {
  return request<Profile>("/api/v1/me", { method: "PATCH", body: data });
}
