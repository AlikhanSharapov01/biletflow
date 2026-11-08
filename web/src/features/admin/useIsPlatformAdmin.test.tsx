import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAdminMe } from "../../api/admin";
import { ApiError } from "../../api/errors";
import { makeAuthValue, makeProfile } from "../../../tests/helpers/fixtures";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import { useIsPlatformAdmin } from "./useIsPlatformAdmin";

vi.mock("../../api/admin", () => ({ getAdminMe: vi.fn() }));
const getAdminMeMock = vi.mocked(getAdminMe);

// The hook caches answers per user id for the page's lifetime, so every test
// uses its own user id.
function signedIn(userId: string): AuthContextValue {
  return makeAuthValue({ status: "authenticated", profile: makeProfile({ id: userId }) });
}

function renderAdminHook(initial: AuthContextValue) {
  let value = initial;
  const wrapper = ({ children }: { children: ReactNode }) => <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  const hook = renderHook(() => useIsPlatformAdmin(), { wrapper });
  return {
    ...hook,
    switchTo(next: AuthContextValue) {
      value = next;
      hook.rerender();
    },
  };
}

describe("useIsPlatformAdmin", () => {
  afterEach(() => getAdminMeMock.mockReset());

  it("is checking while the session is being restored, without calling the API", () => {
    const { result } = renderAdminHook(makeAuthValue({ status: "restoring" }));
    expect(result.current).toEqual({ isAdmin: false, checking: true });
    expect(getAdminMeMock).not.toHaveBeenCalled();
  });

  it("is never admin for an anonymous visitor", () => {
    const { result } = renderAdminHook(makeAuthValue({ status: "anonymous" }));
    expect(result.current).toEqual({ isAdmin: false, checking: false });
    expect(getAdminMeMock).not.toHaveBeenCalled();
  });

  it("is admin only after the server confirms it", async () => {
    getAdminMeMock.mockResolvedValue({ user_id: "admin-1", is_platform_admin: true });
    const { result } = renderAdminHook(signedIn("admin-1"));
    expect(result.current).toEqual({ isAdmin: false, checking: true });
    await waitFor(() => expect(result.current).toEqual({ isAdmin: true, checking: false }));
    expect(getAdminMeMock).toHaveBeenCalledTimes(1);
  });

  it("is not admin when the server says so", async () => {
    getAdminMeMock.mockResolvedValue({ user_id: "plain-1", is_platform_admin: false });
    const { result } = renderAdminHook(signedIn("plain-1"));
    await waitFor(() => expect(result.current).toEqual({ isAdmin: false, checking: false }));
  });

  it("treats 403 admin_required as a remembered no", async () => {
    getAdminMeMock.mockRejectedValue(new ApiError("This area is for platform administrators.", 403, "admin_required"));
    const first = renderAdminHook(signedIn("organizer-1"));
    await waitFor(() => expect(first.result.current).toEqual({ isAdmin: false, checking: false }));
    first.unmount();

    const second = renderAdminHook(signedIn("organizer-1"));
    expect(second.result.current).toEqual({ isAdmin: false, checking: false });
    expect(getAdminMeMock).toHaveBeenCalledTimes(1);
  });

  it("denies on a network or server error but asks again next time", async () => {
    getAdminMeMock.mockRejectedValueOnce(new ApiError("offline", 0, "network"));
    const first = renderAdminHook(signedIn("flaky-1"));
    await waitFor(() => expect(first.result.current).toEqual({ isAdmin: false, checking: false }));
    first.unmount();

    getAdminMeMock.mockResolvedValueOnce({ user_id: "flaky-1", is_platform_admin: true });
    const second = renderAdminHook(signedIn("flaky-1"));
    await waitFor(() => expect(second.result.current).toEqual({ isAdmin: true, checking: false }));
    expect(getAdminMeMock).toHaveBeenCalledTimes(2);
  });

  it("does not carry one user's admin answer over to the next user", async () => {
    getAdminMeMock.mockResolvedValueOnce({ user_id: "admin-2", is_platform_admin: true });
    const hook = renderAdminHook(signedIn("admin-2"));
    await waitFor(() => expect(hook.result.current.isAdmin).toBe(true));

    getAdminMeMock.mockReturnValueOnce(new Promise(() => undefined));
    hook.switchTo(signedIn("someone-else"));
    expect(hook.result.current).toEqual({ isAdmin: false, checking: true });

    hook.switchTo(makeAuthValue({ status: "anonymous" }));
    expect(hook.result.current).toEqual({ isAdmin: false, checking: false });
  });
});
