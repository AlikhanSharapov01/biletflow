import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "./client";
import { forgetPublicSettings, getPublicSettings } from "./settings";

vi.mock("./client", () => ({ request: vi.fn() }));

const settings = { hold_minutes: 10, processing_rate_bps: 300, activation_fee_minor: 500_000, upload_max_bytes: 1024, currency: "KZT" };

afterEach(() => {
  forgetPublicSettings();
  vi.clearAllMocks();
});

describe("public settings", () => {
  it("reads the server's values once per page view", async () => {
    vi.mocked(request).mockResolvedValue(settings);
    await expect(getPublicSettings()).resolves.toEqual(settings);
    await getPublicSettings();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/api/v1/settings/public");
  });

  it("retries after a failure and after an admin change", async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(settings);
    await expect(getPublicSettings()).rejects.toThrow("offline");
    await expect(getPublicSettings()).resolves.toEqual(settings);
    forgetPublicSettings();
    await getPublicSettings();
    expect(request).toHaveBeenCalledTimes(3);
  });
});
