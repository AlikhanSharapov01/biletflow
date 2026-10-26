import { describe, expect, it, vi } from "vitest";
import { consumeGoogleCallback } from "./googleCallback";

function fakeLocation(href: string): Location {
  return { href } as Location;
}

function fakeHistory() {
  return { replaceState: vi.fn() } as unknown as History & { replaceState: ReturnType<typeof vi.fn> };
}

describe("consumeGoogleCallback", () => {
  it("reports nothing on a plain URL and leaves history alone", () => {
    const history = fakeHistory();
    expect(consumeGoogleCallback(fakeLocation("http://localhost:5173/discover?q=jazz"), history)).toEqual({ kind: "none" });
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it("extracts the Google code and state and strips them from the address bar", () => {
    const history = fakeHistory();
    const result = consumeGoogleCallback(
      fakeLocation("http://localhost:5173/?code=abc&state=xyz&scope=email&authuser=0&prompt=consent"),
      history,
    );
    expect(result).toEqual({ kind: "code", code: "abc", state: "xyz" });
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/");
  });

  it("keeps unrelated query parameters", () => {
    const history = fakeHistory();
    consumeGoogleCallback(fakeLocation("http://localhost:5173/?google_error=invalid_oauth_state&tab=1"), history);
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/?tab=1");
  });

  it("treats a provider error as the primary outcome", () => {
    const result = consumeGoogleCallback(fakeLocation("http://localhost:5173/?error=access_denied&state=xyz"), fakeHistory());
    expect(result).toEqual({ kind: "provider_error", error: "access_denied", state: "xyz" });
  });

  it("flags a code without state as incomplete", () => {
    expect(consumeGoogleCallback(fakeLocation("http://localhost:5173/?code=abc"), fakeHistory())).toEqual({ kind: "incomplete" });
  });

  it("reads an access token from the fragment", () => {
    expect(consumeGoogleCallback(fakeLocation("http://localhost:5173/#access_token=tok"), fakeHistory())).toEqual({
      kind: "token",
      token: "tok",
    });
  });
});
