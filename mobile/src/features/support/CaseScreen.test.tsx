import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { getDocumentAsync } from "expo-document-picker";
import { openBrowserAsync } from "expo-web-browser";

import { attachmentDownloadLink, caseUpdates, getCase, sendMessage, uploadAttachment } from "@/api/support";
import type { SupportCase, SupportMessage } from "@/api/types/support";
import { CaseScreen } from "@/features/support/CaseScreen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ caseId: "case-1" }),
}));
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: { id: "u1", email: "aida@example.com", display_name: "Aida Nur" } }),
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: jest.fn() }) }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "client-key-1" }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("@/api/support");

const supportCase: SupportCase = {
  id: "case-1",
  kind: "attendee",
  category: "delivery",
  subject: "My ticket email never arrived",
  status: "open",
  requester: { id: "u1", display_name: "Aida Nur" },
  organization_id: null,
  event_id: "event-1",
  order_id: null,
  ticket_id: null,
  assigned_to: null,
  escalated_at: null,
  resolved_at: null,
  last_seq: 1,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  viewer_roles: ["requester"],
};

function message(seq: number, body: string, overrides: Partial<SupportMessage> = {}): SupportMessage {
  return {
    seq,
    type: "message",
    id: `m${seq}`,
    case_id: "case-1",
    author: { id: "u1", display_name: "Aida Nur" },
    author_role: "requester",
    client_message_id: `k${seq}`,
    body,
    created_at: "2026-11-01T10:00:00Z",
    replayed: false,
    attachments: [],
    ...overrides,
  };
}

describe("CaseScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getCase).mockResolvedValue(supportCase);
  });

  it("shows the thread and sends a reply", async () => {
    jest.mocked(caseUpdates).mockResolvedValue({ items: [message(1, "The email never came.")], next_after: 1, has_more: false });
    jest.mocked(sendMessage).mockResolvedValue(message(2, "Any news?"));
    await render(<CaseScreen />);
    expect(await screen.findByText("The email never came.")).toBeTruthy();
    expect(caseUpdates).toHaveBeenCalledWith("case-1", 0);
    await fireEvent.changeText(screen.getByLabelText("Reply"), "  Any news?  ");
    await fireEvent.press(screen.getByText("Send"));
    expect(sendMessage).toHaveBeenCalledWith("case-1", { body: "Any news?", attachment_ids: [], client_message_id: "client-key-1" });
    expect(await screen.findByText("Any news?")).toBeTruthy();
  });

  it("uploads a picked file and sends its id with the message", async () => {
    jest.mocked(caseUpdates).mockResolvedValue({ items: [], next_after: 0, has_more: false });
    jest.mocked(getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///cache/receipt.pdf", name: "receipt.pdf", mimeType: "application/pdf", size: 2048, lastModified: 0 }],
    });
    jest.mocked(uploadAttachment).mockResolvedValue({
      file_id: "file-9",
      mime_type: "application/pdf",
      size_bytes: 2048,
      sha256: "x",
      status: "pending",
      expires_at: "2026-11-01T11:00:00Z",
    });
    jest.mocked(sendMessage).mockResolvedValue(message(2, "Receipt attached"));
    await render(<CaseScreen />);
    await fireEvent.press(await screen.findByText("Attach file"));
    expect(uploadAttachment).toHaveBeenCalledWith("case-1", { uri: "file:///cache/receipt.pdf", name: "receipt.pdf", mimeType: "application/pdf" });
    expect(await screen.findByText("2 KB")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Reply"), "Receipt attached");
    await fireEvent.press(screen.getByText("Send"));
    expect(sendMessage).toHaveBeenCalledWith("case-1", {
      body: "Receipt attached",
      attachment_ids: ["file-9"],
      client_message_id: "client-key-1",
    });
  });

  it("refuses an empty reply", async () => {
    jest.mocked(caseUpdates).mockResolvedValue({ items: [], next_after: 0, has_more: false });
    await render(<CaseScreen />);
    await fireEvent.press(await screen.findByText("Send"));
    expect(screen.getByText("Write a message first.")).toBeTruthy();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("opens an attachment through a fresh signed link", async () => {
    const attachment = {
      id: "att-1",
      file_id: "file-1",
      original_filename: "screenshot.png",
      mime_type: "image/png",
      size_bytes: 4096,
      created_at: "2026-11-01T10:00:00Z",
    };
    jest.mocked(caseUpdates).mockResolvedValue({
      items: [message(1, "See the screenshot", { attachments: [attachment] })],
      next_after: 1,
      has_more: false,
    });
    jest.mocked(attachmentDownloadLink).mockResolvedValue({ url: "https://files.example/signed", expires_at: "2026-11-01T10:05:00Z" });
    await render(<CaseScreen />);
    await fireEvent.press(await screen.findByLabelText("Download screenshot.png"));
    expect(attachmentDownloadLink).toHaveBeenCalledWith("case-1", "att-1");
    await waitFor(() => expect(openBrowserAsync).toHaveBeenCalledWith("https://files.example/signed"));
  });

  it("shows an error when the case cannot be opened", async () => {
    jest.mocked(getCase).mockRejectedValue(new Error("That support case doesn’t exist or you no longer have access to it."));
    jest.mocked(caseUpdates).mockResolvedValue({ items: [], next_after: 0, has_more: false });
    await render(<CaseScreen />);
    expect(await screen.findByText("We couldn’t open this case.")).toBeTruthy();
  });
});
