import { fireEvent, render, screen } from "@testing-library/react-native";

import { getAdminMe, moderateUser, searchUsers } from "@/api/admin";
import { AdminSectionScreen } from "@/features/admin/AdminSectionScreen";
import { forgetPlatformAdminAnswers } from "@/features/admin/useIsPlatformAdmin";

const mockReplace = jest.fn();
let mockParams: Record<string, string> = { section: "users" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: jest.fn() }) }));
jest.mock("@/api/admin");
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: { id: "admin-1" }, logout: jest.fn(), login: jest.fn() }),
}));

const user = {
  id: "user-7",
  email: "dana@example.com",
  display_name: "Dana K",
  status: "active",
  email_verified_at: null,
  created_at: "2026-09-01T10:00:00Z",
  is_platform_admin: false,
};

describe("AdminSectionScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetPlatformAdminAnswers();
    mockParams = { section: "users" };
    jest.mocked(getAdminMe).mockResolvedValue({ user_id: "admin-1", is_platform_admin: true });
  });

  it("loads users and suspends one after asking for a reason", async () => {
    jest.mocked(searchUsers).mockResolvedValue({ items: [user], total: 1, limit: 25, offset: 0 });
    jest.mocked(moderateUser).mockResolvedValue({
      id: "m1",
      target_user_id: "user-7",
      target_event_id: null,
      action: "suspend",
      reason: "Spam",
      actor_user_id: "admin-1",
      created_at: "2026-11-01T00:00:00Z",
    });
    await render(<AdminSectionScreen />);
    expect(await screen.findByText("Dana K")).toBeTruthy();
    expect(searchUsers).toHaveBeenCalledWith({ q: "", status: undefined, limit: 25, offset: 0 });

    await fireEvent.press(screen.getByText("Suspend"));
    expect(screen.getByText("Reason for suspending (signs the user out everywhere)")).toBeTruthy();
    // The reason box is the last empty input: it sits in the dialog after the search field.
    const inputs = screen.getAllByDisplayValue("");
    await fireEvent.changeText(inputs[inputs.length - 1], "Spam");
    await fireEvent.press(screen.getByRole("button", { name: "Suspend user" }));
    expect(moderateUser).toHaveBeenCalledWith("user-7", "suspend", "Spam");
    expect(searchUsers).toHaveBeenCalledTimes(2);
  });

  it("shows the load error for the users list", async () => {
    jest.mocked(searchUsers).mockRejectedValue(new Error("The service is temporarily unavailable."));
    await render(<AdminSectionScreen />);
    expect(await screen.findByText("We couldn’t load users.")).toBeTruthy();
  });

  it("keeps non-admins out", async () => {
    jest.mocked(getAdminMe).mockResolvedValue({ user_id: "admin-1", is_platform_admin: false });
    await render(<AdminSectionScreen />);
    expect(await screen.findByText("Admins only")).toBeTruthy();
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it("explains an unknown section with a way back", async () => {
    mockParams = { section: "billing" };
    await render(<AdminSectionScreen />);
    await fireEvent.press(await screen.findByText("Back to admin sections"));
    expect(mockReplace).toHaveBeenCalledWith("/admin");
  });
});
