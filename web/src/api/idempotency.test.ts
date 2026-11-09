import { afterEach, expect, it, vi } from "vitest";
import { createHold, confirmHold, startCheckout } from "./checkout";
import { startActivation } from "./paidSales";
import { retryPayment } from "./paidCheckout";
import { session } from "./session";

afterEach(() => { vi.unstubAllGlobals(); session.clear(); });

it("sends distinct keys for new operations and supports explicit retry keys", async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}")));
  vi.stubGlobal("fetch", fetchMock);
  await createHold("event", []);
  await confirmHold("hold", []);
  await startCheckout("hold", []);
  await startActivation("event");
  await retryPayment("order");
  const keys = fetchMock.mock.calls.map((call) => new Headers(call[1].headers).get("Idempotency-Key"));
  expect(keys.every((key) => key && key.length >= 8)).toBe(true);
  expect(new Set(keys).size).toBe(5);
  await startCheckout("hold", [], "retry-key-123");
  expect(new Headers(fetchMock.mock.calls[5]![1].headers).get("Idempotency-Key")).toBe("retry-key-123");
});
