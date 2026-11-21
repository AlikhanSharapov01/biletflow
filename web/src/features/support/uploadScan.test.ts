import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api/support";
import { ApiError } from "../../api/errors";
import type { SupportUploadedFile } from "../../api/types/support";
import { pollUpload, scanState } from "./uploadScan";

vi.mock("../../api/support", () => ({ getUpload: vi.fn() }));

function upload(overrides: Partial<SupportUploadedFile> = {}): SupportUploadedFile {
  return {
    file_id: "f1",
    mime_type: "image/png",
    size_bytes: 1234,
    sha256: "ab",
    status: "quarantined",
    expires_at: "2026-11-21T11:00:00Z",
    ...overrides,
  };
}

const NOW = Date.parse("2026-11-21T10:00:00Z");

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("scanState", () => {
  it("maps every stored_file status", () => {
    expect(scanState("pending")).toBe("checking");
    expect(scanState("quarantined")).toBe("checking");
    expect(scanState("clean")).toBe("ready");
    expect(scanState("rejected")).toBe("blocked");
    expect(scanState("deleted")).toBe("blocked");
  });
});

describe("pollUpload", () => {
  it("polls while quarantined and reports ready once the scan is clean", async () => {
    vi.mocked(api.getUpload).mockResolvedValueOnce(upload()).mockResolvedValueOnce(upload({ status: "clean" }));
    const done = vi.fn();
    pollUpload("c1", upload(), done, { intervalMs: 1000, now: () => NOW });
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.getUpload).toHaveBeenCalledWith("c1", "f1");
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toHaveBeenCalledWith("ready");
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getUpload).toHaveBeenCalledTimes(2);
  });

  it("reports blocked when the scan rejects the file", async () => {
    vi.mocked(api.getUpload).mockResolvedValue(upload({ status: "rejected" }));
    const done = vi.fn();
    pollUpload("c1", upload(), done, { intervalMs: 1000, now: () => NOW });
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toHaveBeenCalledWith("blocked");
  });

  it("keeps polling through temporary errors, and a 404 means the upload is gone", async () => {
    vi.mocked(api.getUpload)
      .mockRejectedValueOnce(new ApiError("Network", 0, "network"))
      .mockRejectedValueOnce(new ApiError("Gone", 404, "attachment_not_found"));
    const done = vi.fn();
    pollUpload("c1", upload(), done, { intervalMs: 1000, now: () => NOW });
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toHaveBeenCalledWith("blocked");
  });

  it("gives up as blocked when the link window ends unscanned", async () => {
    const done = vi.fn();
    pollUpload("c1", upload(), done, { intervalMs: 1000, now: () => Date.parse("2026-11-21T11:00:01Z") });
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toHaveBeenCalledWith("blocked");
    expect(api.getUpload).not.toHaveBeenCalled();
  });

  it("stops when cancelled", async () => {
    vi.mocked(api.getUpload).mockResolvedValue(upload());
    const done = vi.fn();
    const stop = pollUpload("c1", upload(), done, { intervalMs: 1000, now: () => NOW });
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getUpload).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
  });
});
