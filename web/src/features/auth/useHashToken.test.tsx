import { renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TOKEN_FLOW_IDLE, useHashToken } from "./useHashToken";

function visit(url: string) {
  window.history.replaceState(null, "", url);
}

describe("useHashToken", () => {
  afterEach(() => visit("/"));

  it("reads the emailed token and strips it from the address bar", () => {
    visit("/reset-password?lang=en#token=abc123");
    const { result } = renderHook(() => useHashToken());
    expect(result.current).toBe("abc123");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/reset-password");
    expect(window.location.search).toBe("?lang=en");
  });

  it("keeps the same token across re-renders even though the hash is gone", () => {
    visit("/verify-email#token=once");
    const { result, rerender } = renderHook(() => useHashToken());
    rerender();
    rerender();
    expect(result.current).toBe("once");
  });

  it("still has the token under StrictMode double rendering", () => {
    visit("/verify-email#token=strict");
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useHashToken(), { wrapper });
    expect(result.current).toBe("strict");
    expect(window.location.hash).toBe("");
  });

  it("returns an empty string without a token", () => {
    visit("/verify-email#other=1");
    const { result } = renderHook(() => useHashToken());
    expect(result.current).toBe("");
    // An unrelated fragment is left alone.
    expect(window.location.hash).toBe("#other=1");
  });

  it("exposes an idle flow state", () => {
    expect(TOKEN_FLOW_IDLE).toEqual({ busy: false, done: false, message: "" });
  });
});
