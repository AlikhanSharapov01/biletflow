// Account calls made while signed in (or from emailed links), with the web's
// shapes. Sign-in, registration and token refresh stay in api/auth.ts, which
// keeps the refresh token in the response body for the device keychain.
import { request } from "./http";
import type { Message, Profile, ProfileUpdate, SessionView } from "./types";

export function resendVerification(email: string): Promise<Message> {
  return request<Message>("/api/v1/auth/verification/resend", { method: "POST", body: { email } });
}

export function verifyEmail(token: string): Promise<Message> {
  return request<Message>("/api/v1/auth/verify-email", { method: "POST", body: { token } });
}

export function resetPassword(token: string, password: string): Promise<Message> {
  return request<Message>("/api/v1/auth/password/reset", { method: "POST", body: { token, password } });
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

export function getMyProfile(): Promise<Profile> {
  return request<Profile>("/api/v1/me");
}

export function updateProfile(data: ProfileUpdate): Promise<Profile> {
  return request<Profile>("/api/v1/me", { method: "PATCH", body: data });
}
