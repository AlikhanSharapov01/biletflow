import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../api/support";
import { ApiError } from "../../../api/errors";
import type { SupportUploadedFile } from "../../../api/types/support";
import { Composer } from "./Composer";

vi.mock("../../../api/support", () => ({ uploadAttachment: vi.fn(), getUpload: vi.fn(), sendMessage: vi.fn() }));
vi.mock("../../../hooks/usePublicSettings", () => ({ usePublicSettings: () => ({ upload_max_bytes: 5 * 1024 * 1024 }) }));

function uploaded(status: SupportUploadedFile["status"]): SupportUploadedFile {
  return { file_id: "f1", mime_type: "image/png", size_bytes: 4, sha256: "ab", status, expires_at: "2999-01-01T00:00:00Z" };
}

async function pick(container: HTMLElement, file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input");
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

const png = () => new File(["test"], "scan.png", { type: "image/png" });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("composer attachment scan states", () => {
  it("shows Checking file… while quarantined, polls, then Ready", async () => {
    vi.mocked(api.uploadAttachment).mockResolvedValue(uploaded("quarantined"));
    vi.mocked(api.getUpload).mockResolvedValueOnce(uploaded("quarantined")).mockResolvedValueOnce(uploaded("clean"));
    const { container } = render(<Composer caseId="c1" onSent={vi.fn()} />);
    await pick(container, png());

    expect(screen.getByText("Checking file…")).toBeTruthy();
    const checkingButton = screen.getByRole("button", { name: "Checking files…" });
    expect(checkingButton.getAttribute("aria-busy")).toBe("true");
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "hello" } });
    await act(async () => {
      fireEvent.click(checkingButton);
    });
    expect(api.sendMessage).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByText("Checking file…")).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(api.getUpload).toHaveBeenCalledWith("c1", "f1");
    expect(screen.getByText(/^Ready/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("aria-busy")).toBe(false);
  });

  it("shows Blocked and never sends a file the scan rejected", async () => {
    vi.mocked(api.uploadAttachment).mockResolvedValue(uploaded("quarantined"));
    vi.mocked(api.getUpload).mockResolvedValue(uploaded("rejected"));
    vi.mocked(api.sendMessage).mockResolvedValue({} as never);
    const { container } = render(<Composer caseId="c1" onSent={vi.fn()} />);
    await pick(container, png());
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(screen.getByText(/^Blocked/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "hello" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });
    expect(api.sendMessage).toHaveBeenCalledWith("c1", expect.objectContaining({ body: "hello", attachment_ids: [] }));
  });

  it("marks a clean upload Ready at once without polling", async () => {
    vi.mocked(api.uploadAttachment).mockResolvedValue(uploaded("clean"));
    const { container } = render(<Composer caseId="c1" onSent={vi.fn()} />);
    await pick(container, png());
    expect(screen.getByText(/^Ready/)).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(api.getUpload).not.toHaveBeenCalled();
  });

  it("shows the backend's message for a rejected file type", async () => {
    vi.mocked(api.uploadAttachment).mockRejectedValue(
      new ApiError("Only PNG, JPEG and PDF files can be attached.", 415, "unsupported_media_type"),
    );
    const { container } = render(<Composer caseId="c1" onSent={vi.fn()} />);
    await pick(container, new File(["gif"], "a.gif", { type: "image/gif" }));
    expect(api.uploadAttachment).toHaveBeenCalled();
    expect(screen.getByText("Only PNG, JPEG and PDF files can be attached.")).toBeTruthy();
  });

  it("ignores a second send and the attach button while a message is sending", async () => {
    vi.mocked(api.sendMessage).mockReturnValue(new Promise(() => undefined));
    const { container } = render(<Composer caseId="c1" onSent={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "hello" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });
    const sending = screen.getByRole("button", { name: "Sending…" });
    expect(sending.getAttribute("aria-busy")).toBe("true");
    const attach = screen.getByRole("button", { name: "Attach file" });
    expect(attach.hasAttribute("aria-busy")).toBe(false);
    expect(attach.getAttribute("aria-disabled")).toBe("true");
    expect(attach.hasAttribute("disabled")).toBe(false);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
    const openPicker = vi.spyOn(fileInput, "click");
    fireEvent.click(attach);
    expect(openPicker).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(sending);
    });
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("stops polling when the file is removed", async () => {
    vi.mocked(api.uploadAttachment).mockResolvedValue(uploaded("quarantined"));
    vi.mocked(api.getUpload).mockResolvedValue(uploaded("quarantined"));
    const { container } = render(<Composer caseId="c1" onSent={vi.fn()} />);
    await pick(container, png());
    fireEvent.click(screen.getByRole("button", { name: /scan\.png/ }));
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(api.getUpload).not.toHaveBeenCalled();
  });
});
