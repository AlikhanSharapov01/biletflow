import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as authApi from "../api/auth";
import { refreshAccessToken } from "../api/client";
import { SESSION_EXPIRED_MESSAGE, describeError, googleErrorMessage } from "../api/errors";
import { session } from "../api/session";
import type { Profile } from "../api/types";
import { consumeGoogleCallback } from "./googleCallback";

export type AuthStatus = "restoring" | "anonymous" | "authenticated";

export interface AuthContextValue {
  status: AuthStatus;
  profile: Profile | null;
  // Shown on the sign-in page: why the user landed there (expiry, Google errors).
  notice: string;
  signIn: (credentials: authApi.Credentials) => Promise<void>;
  register: (data: authApi.Registration) => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  setProfile: (profile: Profile) => void;
  clearNotice: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [notice, setNotice] = useState("");

  const becomeAnonymous = useCallback((message = "") => {
    session.clear();
    setProfileState(null);
    setStatus("anonymous");
    setNotice(message);
  }, []);

  const completeSignIn = useCallback(async (token: string) => {
    session.set(token);
    const me = await authApi.getProfile();
    setProfileState(me);
    setStatus("authenticated");
    setNotice("");
  }, []);

  // Restore the session once on load: finish a Google redirect if one is in
  // progress, otherwise use the refresh cookie.
  useEffect(() => {
    let active = true;
    const finish = (fn: () => void) => {
      if (active) fn();
    };

    (async () => {
      const callback = consumeGoogleCallback();
      try {
        switch (callback.kind) {
          case "provider_error": {
            let message = googleErrorMessage(
              callback.error === "access_denied" ? "google_authorization_denied" : "google_exchange_failed",
            );
            if (callback.state) {
              try {
                await authApi.completeGoogleSignIn({ state: callback.state, error: callback.error });
              } catch (failure) {
                message = describeError(failure);
              }
            }
            finish(() => becomeAnonymous(message));
            return;
          }
          case "incomplete":
            finish(() => becomeAnonymous("Google returned an incomplete sign-in response. Please try again."));
            return;
          case "backend_error":
            finish(() => becomeAnonymous(googleErrorMessage(callback.code)));
            return;
          case "code": {
            const tokens = await authApi.completeGoogleSignIn({ code: callback.code, state: callback.state });
            if (active) await completeSignIn(tokens.access_token);
            return;
          }
          case "token":
            if (active) await completeSignIn(callback.token);
            return;
          case "none": {
            const token = await refreshAccessToken();
            if (!active) return;
            if (!token) {
              becomeAnonymous();
              return;
            }
            await completeSignIn(token);
          }
        }
      } catch (failure) {
        finish(() => becomeAnonymous(describeError(failure)));
      }
    })();

    return () => {
      active = false;
    };
  }, [becomeAnonymous, completeSignIn]);

  // The API client reports when a refresh fails mid-session.
  useEffect(() => session.onExpired(() => becomeAnonymous(SESSION_EXPIRED_MESSAGE)), [becomeAnonymous]);

  const signIn = useCallback(
    async (credentials: authApi.Credentials) => {
      const tokens = await authApi.login(credentials);
      try {
        await completeSignIn(tokens.access_token);
      } catch (failure) {
        session.clear();
        throw failure;
      }
    },
    [completeSignIn],
  );

  const register = useCallback(async (data: authApi.Registration) => {
    await authApi.register(data);
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (session.token) await authApi.logout();
    } catch {
      // The server session may already be gone; the local state is cleared either way.
    }
    becomeAnonymous();
  }, [becomeAnonymous]);

  const signOutEverywhere = useCallback(async () => {
    await authApi.logoutEverywhere();
    becomeAnonymous();
  }, [becomeAnonymous]);

  const setProfile = useCallback((next: Profile) => setProfileState(next), []);
  const clearNotice = useCallback(() => setNotice(""), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, profile, notice, signIn, register, signOut, signOutEverywhere, setProfile, clearNotice }),
    [status, profile, notice, signIn, register, signOut, signOutEverywhere, setProfile, clearNotice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
