import { fireEvent, render, screen } from "@testing-library/react-native";

import { listSessions, revokeSession } from "@/api/account";
import { saveTokens } from "@/api/tokenStorage";
import { SessionsScreen } from "@/features/account/SessionsScreen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: jest.fn() }) }));
jest.mock("@/api/account");

const future = "2099-01-01T00:00:00Z";
const sessions = [
  { id: "sess-current", client_kind: "scanner" as const, created_at: "2026-11-01T10:00:00Z", expires_at: future, revoked_at: null, last_seen_at: null },
  { id: "sess-web", client_kind: "web" as const, created_at: "2026-10-01T10:00:00Z", expires_at: future, revoked_at: null, last_seen_at: "2026-11-02T10:00:00Z" },
];

function tokenFor(sid: string): string {
  return `h.${Buffer.from(JSON.stringify({ sid })).toString("base64url")}.s`;
}

describe("SessionsScreen", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await saveTokens(tokenFor("sess-current"), "refresh");
  });

  it("marks this device and revokes another session", async () => {
    jest.mocked(listSessions).mockResolvedValue(sessions);
    jest.mocked(revokeSession).mockResolvedValue(undefined);
    await render(<SessionsScreen />);
    expect(await screen.findByText("This device")).toBeTruthy();
    expect(screen.getByText("Web browser")).toBeTruthy();
    // Only the other, still active session can be revoked.
    const revoke = screen.getAllByText("Revoke");
    expect(revoke).toHaveLength(1);
    await fireEvent.press(revoke[0]);
    expect(revokeSession).toHaveBeenCalledWith("sess-web");
    expect(listSessions).toHaveBeenCalledTimes(2);
  });

  it("shows an error with a retry when sessions cannot load", async () => {
    jest.mocked(listSessions).mockRejectedValue(new Error("Can’t reach BiletFlow right now."));
    await render(<SessionsScreen />);
    expect(await screen.findByText("We couldn’t load sessions.")).toBeTruthy();
    expect(screen.getByText("Can’t reach BiletFlow right now.")).toBeTruthy();
  });
});
