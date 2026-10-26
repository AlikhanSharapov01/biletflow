import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request } from "./client";
import { ApiError } from "./errors";
import { session } from "./session";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("request", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    session.clear();
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("attaches the bearer token and parses JSON", async () => {
    session.set("token-1");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: "me" }));

    const result = await request<{ id: string }>("/api/v1/me");

    expect(result).toEqual({ id: "me" });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token-1");
  });

  it("maps backend error codes to readable messages", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { detail: { code: "invalid_credentials" } }));

    await expect(request("/api/v1/auth/login", { method: "POST", body: {} })).rejects.toMatchObject({
      name: "ApiError",
      code: "invalid_credentials",
      message: "That email and password don’t match.",
    });
  });

  it("renews an expired access token once and retries", async () => {
    session.set("stale");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: { code: "token_expired" } }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "fresh", token_type: "bearer", expires_in: 900 }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await request<{ ok: boolean }>("/api/v1/organizations");

    expect(result).toEqual({ ok: true });
    expect(session.token).toBe("fresh");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]![0])).toBe("/api/v1/auth/refresh");
    expect(new Headers(fetchMock.mock.calls[2]![1]?.headers).get("Authorization")).toBe("Bearer fresh");
  });

  it("signals session expiry when the refresh cookie is gone", async () => {
    session.set("stale");
    const expired = vi.fn();
    const unsubscribe = session.onExpired(expired);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: { code: "token_expired" } }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: { code: "invalid_refresh" } }));

    await expect(request("/api/v1/organizations")).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(session.token).toBe("");
    unsubscribe();
  });

  it("does not try to refresh for anonymous requests", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { detail: { code: "unauthorized" } }));

    await expect(request("/api/v1/organizations")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("turns network failures into a readable error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(request("/api/v1/events")).rejects.toMatchObject({ code: "network" });
  });
});
