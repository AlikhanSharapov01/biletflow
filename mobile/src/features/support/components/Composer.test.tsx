import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { getDocumentAsync } from "expo-document-picker";

import { ApiError } from "@/api/errors";
import { getUpload, sendMessage, uploadAttachment } from "@/api/support";
import type { SupportUploadedFile } from "@/api/types/support";

import { Composer, SCAN_POLL_MS } from "./Composer";

jest.mock("expo-crypto", () => ({ randomUUID: () => "client-key-1" }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("@/api/support");

const upload = (status: SupportUploadedFile["status"], file_id = "file-1"): SupportUploadedFile => ({
  file_id,
  mime_type: "application/pdf",
  size_bytes: 2048,
  sha256: "x",
  status,
  expires_at: "2026-11-18T11:00:00Z",
});

async function attach(name = "receipt.pdf") {
  jest.mocked(getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: `file:///cache/${name}`, name, mimeType: "application/pdf", size: 2048, lastModified: 0 }],
  });
  await fireEvent.press(screen.getByText("Attach file"));
}

async function tick() {
  await act(async () => {
    jest.advanceTimersByTime(SCAN_POLL_MS);
  });
}

describe("Composer upload status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a quarantined file as being checked, polls it and sends it once it is ready", async () => {
    jest.mocked(uploadAttachment).mockResolvedValue(upload("quarantined"));
    jest.mocked(getUpload).mockResolvedValueOnce(upload("quarantined")).mockResolvedValueOnce(upload("clean"));
    jest.mocked(sendMessage).mockResolvedValue({} as never);
    await render(<Composer caseId="case-1" onSent={jest.fn()} />);
    await attach();

    expect(await screen.findByText("Checking file…")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Reply"), "Receipt attached");
    // Nothing can be sent while a file is still being checked.
    await fireEvent.press(screen.getByText("Checking files…"));
    expect(sendMessage).not.toHaveBeenCalled();

    await tick();
    expect(getUpload).toHaveBeenCalledWith("case-1", "file-1");
    expect(screen.getByText("Checking file…")).toBeTruthy();
    await tick();
    expect(await screen.findByText("Ready · 2 KB")).toBeTruthy();
    expect(getUpload).toHaveBeenCalledTimes(2);

    await fireEvent.press(screen.getByText("Send"));
    expect(sendMessage).toHaveBeenCalledWith("case-1", { body: "Receipt attached", attachment_ids: ["file-1"], client_message_id: "client-key-1" });

    // Polling stops once nothing is waiting for a verdict.
    await tick();
    expect(getUpload).toHaveBeenCalledTimes(2);
  });

  it("blocks a file the scanner rejects and leaves it out of the message", async () => {
    jest.mocked(uploadAttachment).mockResolvedValueOnce(upload("quarantined", "bad")).mockResolvedValueOnce(upload("clean", "good"));
    jest.mocked(getUpload).mockResolvedValue(upload("rejected", "bad"));
    jest.mocked(sendMessage).mockResolvedValue({} as never);
    await render(<Composer caseId="case-1" onSent={jest.fn()} />);
    await attach("bad.pdf");
    await attach("good.pdf");
    await tick();

    expect(await screen.findByText("Blocked · This file did not pass the safety check and will not be sent.")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Reply"), "Two files");
    await fireEvent.press(screen.getByText("Send"));
    expect(sendMessage).toHaveBeenCalledWith("case-1", { body: "Two files", attachment_ids: ["good"], client_message_id: "client-key-1" });
  });

  it("shows an infected upload as blocked straight away", async () => {
    jest.mocked(uploadAttachment).mockRejectedValue(new ApiError("This file did not pass the virus check.", 422, "attachment_infected"));
    await render(<Composer caseId="case-1" onSent={jest.fn()} />);
    await attach();
    expect(await screen.findByText("Blocked · This file did not pass the virus check.")).toBeTruthy();
    await tick();
    expect(getUpload).not.toHaveBeenCalled();
  });

  it("keeps checking through a failed poll and gives up on a file that expired", async () => {
    jest.mocked(uploadAttachment).mockResolvedValue(upload("quarantined"));
    jest.mocked(getUpload).mockRejectedValueOnce(new Error("Network request failed")).mockResolvedValueOnce(upload("deleted"));
    await render(<Composer caseId="case-1" onSent={jest.fn()} />);
    await attach();
    await tick();
    expect(screen.getByText("Checking file…")).toBeTruthy();
    await tick();
    expect(await screen.findByText("The file could not be checked in time. Attach it again.")).toBeTruthy();
  });
});
