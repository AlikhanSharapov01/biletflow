import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authApi from "../../api/auth";
import { refreshAccessToken } from "../../api/client";
import { ApiError, SESSION_EXPIRED_MESSAGE } from "../../api/errors";
import { session } from "../../api/session";
import { makeProfile } from "../../../tests/helpers/fixtures";
import { AuthProvider, useAuth, type AuthContextValue } from "./AuthContext";

vi.mock("../../api/client", () => ({ refreshAccessToken: vi.fn() }));
vi.mock("../../api/auth", () => ({
  getProfile: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  logoutEverywhere: vi.fn(),
  completeGoogleSignIn: vi.fn(),
}));

const refreshMock = vi.mocked(refreshAccessToken);
const api = vi.mocked(authApi);

const tokens = (access_token: string) => ({ access_token, token_type: "bearer", expires_in: 900, refresh_token: null });

let current: AuthContextValue | null = null;
function Probe() {
  current = useAuth();
  return null;
}

function auth(): AuthContextValue {
  if (!current) throw new Error("AuthProvider did not render");
  return current;
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  current = null;
  session.clear();
  window.history.replaceState(null, "", "/discover");
});

afterEach(() => {
  vi.clearAllMocks();
  refreshMock.mockReset();
  for (const fn of Object.values(api)) (fn as ReturnType<typeof vi.fn>).mockReset();
  session.clear();
});

describe("AuthProvider session restore", () => {
  it("starts restoring, then becomes anonymous without a refresh cookie", async () => {
    refreshMock.mockResolvedValue(null);
    renderProvider();
    expect(auth().status).toBe("restoring");
    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(auth().profile).toBeNull();
    expect(auth().notice).toBe("");
    expect(api.getProfile).not.toHaveBeenCalled();
  });

  it("restores the session from the refresh cookie", async () => {
    refreshMock.mockImplementation(async () => {
      session.set("restored");
      return "restored";
    });
    api.getProfile.mockResolvedValue(makeProfile({ display_name: "Aida" }));
    renderProvider();
    await waitFor(() => expect(auth().status).toBe("authenticated"));
    expect(auth().profile?.display_name).toBe("Aida");
    expect(session.token).toBe("restored");
  });

  it("falls back to anonymous with the reason when restore fails", async () => {
    refreshMock.mockRejectedValue(new ApiError("The service is temporarily unavailable. Please try again shortly.", 503));
    renderProvider();
    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(auth().notice).toBe("The service is temporarily unavailable. Please try again shortly.");
    expect(session.token).toBe("");
  });

  it("does not stay signed in when the profile cannot be loaded", async () => {
    refreshMock.mockResolvedValue("token");
    api.getProfile.mockRejectedValue(new ApiError("This account is unavailable.", 403, "suspended_account"));
    renderProvider();
    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(auth().profile).toBeNull();
    expect(session.token).toBe("");
  });

  it("finishes a Google sign-in from the token fragment and cleans the URL", async () => {
    window.history.replaceState(null, "", "/discover#access_token=google-token");
    api.getProfile.mockResolvedValue(makeProfile());
    renderProvider();
    await waitFor(() => expect(auth().status).toBe("authenticated"));
    expect(session.token).toBe("google-token");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("exchanges a Google code and state", async () => {
    window.history.replaceState(null, "", "/?code=c1&state=s1");
    api.completeGoogleSignIn.mockResolvedValue(tokens("from-code"));
    api.getProfile.mockResolvedValue(makeProfile());
    renderProvider();
    await waitFor(() => expect(auth().status).toBe("authenticated"));
    expect(api.completeGoogleSignIn).toHaveBeenCalledWith({ code: "c1", state: "s1" });
    expect(session.token).toBe("from-code");
    expect(window.location.search).toBe("");
  });

  it("explains a cancelled Google sign-in", async () => {
    window.history.replaceState(null, "", "/?error=access_denied");
    renderProvider();
    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(auth().notice).toBe("Google sign-in was cancelled. You can try again whenever you’re ready.");
    expect(api.completeGoogleSignIn).not.toHaveBeenCalled();
  });

  it("reports the backend's reason for a provider error with state", async () => {
    window.history.replaceState(null, "", "/?error=server_error&state=s1");
    api.completeGoogleSignIn.mockRejectedValue(new ApiError("This Google sign-in expired or could not be verified. Please start again.", 400, "invalid_oauth_state"));
    renderProvider();
    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(api.completeGoogleSignIn).toHaveBeenCalledWith({ state: "s1", error: "server_error" });
    expect(auth().notice).toBe("This Google sign-in expired or could not be verified. Please start again.");
  });

  it("shows a backend Google error code", async () => {
    window.history.replaceState(null, "", "/?google_error=account_link_required");
    renderProvider();
    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(auth().notice).toContain("Sign in with your password first");
  });

  it("rejects an incomplete Google response", async () => {
    window.history.replaceState(null, "", "/?code=only-code");
    renderProvider();
    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(auth().notice).toBe("Google returned an incomplete sign-in response. Please try again.");
    expect(api.completeGoogleSignIn).not.toHaveBeenCalled();
  });
});

describe("AuthProvider actions", () => {
  async function anonymous() {
    refreshMock.mockResolvedValue(null);
    renderProvider();
    await waitFor(() => expect(auth().status).toBe("anonymous"));
  }

  it("signs in and loads the profile", async () => {
    await anonymous();
    api.login.mockResolvedValue(tokens("fresh"));
    api.getProfile.mockResolvedValue(makeProfile({ id: "u7" }));
    await act(() => auth().signIn({ email: "aida@example.com", password: "correct horse" }));
    expect(api.login).toHaveBeenCalledWith({ email: "aida@example.com", password: "correct horse" });
    expect(auth().status).toBe("authenticated");
    expect(auth().profile?.id).toBe("u7");
    expect(session.token).toBe("fresh");
  });

  it("surfaces a login failure and stays anonymous", async () => {
    await anonymous();
    api.login.mockRejectedValue(new ApiError("That email and password don’t match.", 401, "invalid_credentials"));
    await expect(act(() => auth().signIn({ email: "a@b.kz", password: "wrong" }))).rejects.toThrow("That email and password don’t match.");
    expect(auth().status).toBe("anonymous");
    expect(session.token).toBe("");
  });

  it("drops the new token when the profile fails after login", async () => {
    await anonymous();
    api.login.mockResolvedValue(tokens("half"));
    api.getProfile.mockRejectedValue(new ApiError("This account is unavailable.", 403, "suspended_account"));
    await expect(act(() => auth().signIn({ email: "a@b.kz", password: "pw" }))).rejects.toThrow("This account is unavailable.");
    expect(session.token).toBe("");
    expect(auth().status).toBe("anonymous");
  });

  it("signs out locally even when the server call fails", async () => {
    await anonymous();
    api.login.mockResolvedValue(tokens("t"));
    api.getProfile.mockResolvedValue(makeProfile());
    await act(() => auth().signIn({ email: "a@b.kz", password: "pw" }));
    api.logout.mockRejectedValue(new ApiError("offline", 0, "network"));

    await act(() => auth().signOut());
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(auth().status).toBe("anonymous");
    expect(auth().profile).toBeNull();
    expect(session.token).toBe("");
  });

  it("only clears local state on sign-out everywhere after the server agrees", async () => {
    await anonymous();
    api.login.mockResolvedValue(tokens("t"));
    api.getProfile.mockResolvedValue(makeProfile());
    await act(() => auth().signIn({ email: "a@b.kz", password: "pw" }));
    api.logoutEverywhere.mockRejectedValue(new ApiError("offline", 0, "network"));
    await expect(act(() => auth().signOutEverywhere())).rejects.toThrow("offline");
    expect(auth().status).toBe("authenticated");

    api.logoutEverywhere.mockResolvedValue({});
    await act(() => auth().signOutEverywhere());
    expect(auth().status).toBe("anonymous");
  });

  it("registers without signing in", async () => {
    await anonymous();
    api.register.mockResolvedValue({ code: "registration_received" });
    await act(() => auth().register({ email: "a@b.kz", password: "long enough pw", display_name: "A", locale: "en" }));
    expect(api.register).toHaveBeenCalledTimes(1);
    expect(auth().status).toBe("anonymous");
  });

  it("becomes anonymous with a notice when the session expires mid-use", async () => {
    await anonymous();
    api.login.mockResolvedValue(tokens("t"));
    api.getProfile.mockResolvedValue(makeProfile());
    await act(() => auth().signIn({ email: "a@b.kz", password: "pw" }));

    act(() => session.expire());
    expect(auth().status).toBe("anonymous");
    expect(auth().notice).toBe(SESSION_EXPIRED_MESSAGE);

    act(() => auth().clearNotice());
    expect(auth().notice).toBe("");
  });
});

describe("useAuth", () => {
  it("refuses to run outside AuthProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useAuth())).toThrow("useAuth must be used inside AuthProvider");
    spy.mockRestore();
  });
});
