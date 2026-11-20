import { act, renderHook } from "@testing-library/react-native";

import { postMeasurement } from "@/api/analytics";

import { measure, useMeasureView } from "./measure";

jest.mock("@/api/analytics", () => ({ postMeasurement: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "measure-1") }));
let mockConsent = true;
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ profile: { id: "u1", analytics_consent: mockConsent } }),
}));

const consenting = { id: "u1", email: "a@example.com", display_name: "A", locale: "en" as const, email_verified_at: null, analytics_consent: true };

describe("traffic measurements", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConsent = true;
    jest.mocked(postMeasurement).mockResolvedValue({ status: "accepted", reason: null });
  });

  it("sends only the allowlisted fields through the backend contract", () => {
    measure(consenting, "event_view", "e1");
    expect(postMeasurement).toHaveBeenCalledWith({
      name: "event_view",
      analytics_event_id: "measure-1",
      event_id: "e1",
      platform: "mobile",
      page_path: "/events/event",
    });
  });

  it("sends nothing without consent or when signed out", () => {
    measure({ ...consenting, analytics_consent: false }, "event_view", "e1");
    measure(null, "event_view", "e1");
    expect(postMeasurement).not.toHaveBeenCalled();
  });

  it("never lets a failed measurement reach the screen", async () => {
    jest.mocked(postMeasurement).mockRejectedValue(new Error("rate_limited"));
    expect(() => measure(consenting, "checkout_start", "e1")).not.toThrow();
    await act(async () => {});
  });

  it("counts a screen view once per event, and only after consent", async () => {
    mockConsent = false;
    const { rerender } = await renderHook(({ id }: { id: string }) => useMeasureView("event_view", id), { initialProps: { id: "e1" } });
    expect(postMeasurement).not.toHaveBeenCalled();

    mockConsent = true;
    await rerender({ id: "e1" });
    await rerender({ id: "e1" });
    expect(postMeasurement).toHaveBeenCalledTimes(1);

    await rerender({ id: "e2" });
    expect(postMeasurement).toHaveBeenCalledTimes(2);
    expect(jest.mocked(postMeasurement).mock.calls[1]![0]).toMatchObject({ name: "event_view", event_id: "e2" });
  });
});
