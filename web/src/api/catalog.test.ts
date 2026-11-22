import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listEvents } from "./catalog";

describe("listEvents", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  const lastParams = () => new URL(String(fetchMock.mock.calls[0][0]), "http://x").searchParams;

  it("defaults the limit to 50 and sends nothing else", async () => {
    await listEvents();
    expect(lastParams().toString()).toBe("limit=50");
  });

  it("sends every defined filter under the backend names", async () => {
    await listEvents({
      q: "jazz",
      category_id: "c1",
      city: "Almaty",
      date_from: "2026-06-10T00:00:00.000Z",
      date_to: "2026-06-11T00:00:00.000Z",
      min_price: 100,
      max_price: 900,
      free: true,
      limit: 24,
      offset: 48,
    });
    const p = lastParams();
    expect(Object.fromEntries(p)).toEqual({
      q: "jazz",
      category_id: "c1",
      city: "Almaty",
      date_from: "2026-06-10T00:00:00.000Z",
      date_to: "2026-06-11T00:00:00.000Z",
      min_price: "100",
      max_price: "900",
      free: "true",
      limit: "24",
      offset: "48",
    });
  });

  it("keeps a zero offset and min price, and omits free when off", async () => {
    await listEvents({ min_price: 0, offset: 0, free: false });
    expect(Object.fromEntries(lastParams())).toEqual({ min_price: "0", offset: "0", limit: "50" });
  });
});
