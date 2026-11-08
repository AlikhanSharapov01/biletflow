import { fireEvent, render, screen } from "@testing-library/react-native";

import { ApiError } from "@/api/errors";
import { acceptInvitation } from "@/api/organizations";
import { AcceptInvitationScreen } from "@/features/organizer/AcceptInvitationScreen";

const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: { id: "u1", email: "aida@example.com", display_name: "Aida Nur" } }),
}));
jest.mock("@/api/organizations");

describe("AcceptInvitationScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  it("accepts the token from a pasted link and opens the workspace", async () => {
    jest.mocked(acceptInvitation).mockResolvedValue({});
    await render(<AcceptInvitationScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText("Paste the link from the email"), "https://biletflow.kz/staff-invitations/accept#token=abc123");
    await fireEvent.press(screen.getByText("Accept invitation"));
    expect(acceptInvitation).toHaveBeenCalledWith("abc123");
    expect(await screen.findByText("You joined the workspace. The owner can now assign you to events.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Open the organizer workspace"));
    expect(mockReplace).toHaveBeenCalledWith("/organizer");
  });

  it("uses a token route parameter and shows server errors", async () => {
    mockParams = { token: "from-route" };
    jest.mocked(acceptInvitation).mockRejectedValue(new ApiError("This invitation has expired.", 410, "invitation_expired"));
    await render(<AcceptInvitationScreen />);
    await fireEvent.press(screen.getByText("Accept invitation"));
    expect(acceptInvitation).toHaveBeenCalledWith("from-route");
    expect(await screen.findByText("This invitation has expired.")).toBeTruthy();
  });
});
