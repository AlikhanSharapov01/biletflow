import { fireEvent, render, screen } from "@testing-library/react-native";

import { getAdminMe } from "@/api/admin";
import { ApiError } from "@/api/errors";
import { updateProfile } from "@/api/account";
import { AccountScreen } from "@/features/account/AccountScreen";
import { forgetPlatformAdminAnswers } from "@/features/admin/useIsPlatformAdmin";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: jest.fn() }) }));
jest.mock("@/api/admin");
jest.mock("@/api/account");

const mockProfile = {
  id: "user-1",
  email: "aru@example.com",
  display_name: "Aru Nurlan",
  locale: "en" as const,
  email_verified_at: "2026-01-01T00:00:00Z",
  analytics_consent: false,
};
const mockLogout = jest.fn();
const mockSetProfile = jest.fn();
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    status: "signedIn",
    profile: mockProfile,
    logout: mockLogout,
    login: jest.fn(),
    setProfile: mockSetProfile,
  }),
}));

describe("AccountScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetPlatformAdminAnswers();
  });

  it("shows the profile and hides the admin row from non-admins", async () => {
    jest.mocked(getAdminMe).mockRejectedValue(new ApiError("Admins only", 403, "admin_required"));
    await render(<AccountScreen />);
    expect(screen.getByText("aru@example.com")).toBeTruthy();
    expect(screen.getByDisplayValue("Aru Nurlan")).toBeTruthy();
    expect(screen.getByText("Email verified")).toBeTruthy();
    await screen.findByText("My orders");
    expect(getAdminMe).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Admin portal")).toBeNull();
  });

  it("shows the admin row when the admin check succeeds", async () => {
    jest.mocked(getAdminMe).mockResolvedValue({ user_id: "user-1", is_platform_admin: true });
    await render(<AccountScreen />);
    await fireEvent.press(await screen.findByLabelText("Admin portal"));
    expect(mockPush).toHaveBeenCalledWith("/admin");
  });

  it("saves the display name and language", async () => {
    jest.mocked(getAdminMe).mockResolvedValue({ user_id: "user-1", is_platform_admin: false });
    jest.mocked(updateProfile).mockResolvedValue({ ...mockProfile, display_name: "Aru N." });
    await render(<AccountScreen />);
    await fireEvent.changeText(screen.getByDisplayValue("Aru Nurlan"), "  Aru N. ");
    await fireEvent.press(screen.getByText("Save profile"));
    expect(updateProfile).toHaveBeenCalledWith({ display_name: "Aru N.", locale: "en" });
    expect(await screen.findByText("Saved.")).toBeTruthy();
    // The new name reaches the shared auth state (top bar, other screens).
    expect(mockSetProfile).toHaveBeenCalledWith(expect.objectContaining({ display_name: "Aru N." }));
  });
});
