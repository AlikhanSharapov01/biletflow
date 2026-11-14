import { confirmHold, createHold, startCheckout } from "@/api/checkout";
import { retryPayment } from "@/api/paidCheckout";
import { startActivation } from "@/api/paidSales";

let mockCounter = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `key-${++mockCounter}` }));
jest.mock("@/api/tokenStorage", () => ({ getTokens: jest.fn().mockResolvedValue({ accessToken: "token" }) }));
jest.mock("@/api/session", () => ({ refreshAccessToken: jest.fn(), expireSession: jest.fn() }));

describe("idempotency keys", () => {
  it("sends distinct keys for new operations and supports explicit retry keys", async () => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("{}") }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await createHold("event", []);
    await confirmHold("hold", []);
    await startCheckout("hold", []);
    await startActivation("event");
    await retryPayment("order");
    const keys = fetchMock.mock.calls.map((call) => call[1].headers["Idempotency-Key"]);
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(5);
    await startCheckout("hold", [], "retry-key-123");
    expect(fetchMock.mock.calls[5][1].headers["Idempotency-Key"]).toBe("retry-key-123");
  });
});
