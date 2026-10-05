import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getProfile,
  login as apiLogin,
  logout as apiLogout,
  refresh as apiRefresh,
  type Profile,
} from "@/api/auth";
import { clearTokens, getTokens, saveTokens } from "@/api/tokenStorage";

type Status = "loading" | "signedIn" | "signedOut";

type AuthContextValue = {
  status: Status;
  profile: Profile | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);

  // On launch: restore whatever session is on disk. An expired access token
  // is expected (they last minutes) — try one refresh before giving up.
  useEffect(() => {
    (async () => {
      const { accessToken, refreshToken } = await getTokens();
      if (!accessToken || !refreshToken) {
        setStatus("signedOut");
        return;
      }

      try {
        setProfile(await getProfile(accessToken));
        setStatus("signedIn");
        return;
      } catch {
        // Fall through to a refresh attempt below.
      }

      try {
        const tokens = await apiRefresh(refreshToken);
        await saveTokens(tokens.access_token, tokens.refresh_token);
        setProfile(await getProfile(tokens.access_token));
        setStatus("signedIn");
      } catch {
        await clearTokens();
        setStatus("signedOut");
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await apiLogin(email, password);
    await saveTokens(tokens.access_token, tokens.refresh_token);
    setProfile(await getProfile(tokens.access_token));
    setStatus("signedIn");
  }, []);

  const logout = useCallback(async () => {
    const { accessToken } = await getTokens();
    if (accessToken) {
      // Best effort: revoke the session server-side, but sign out locally
      // either way — a network failure here shouldn't trap the user in.
      await apiLogout(accessToken).catch(() => {});
    }
    await clearTokens();
    setProfile(null);
    setStatus("signedOut");
  }, []);

  const value = useMemo(
    () => ({ status, profile, login, logout }),
    [status, profile, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
