import { fireEvent, render, screen } from "@testing-library/react-native";

import { verifyEmail } from "@/api/account";
import { ApiError } from "@/api/errors";
import { VerifyEmailScreen } from "@/features/auth/VerifyEmailScreen";

const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/api/account");

describe("VerifyEmailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  it("verifies with the token taken from a pasted link, then goes to sign in", async () => {
    jest.mocked(verifyEmail).mockResolvedValue({ code: "email_verified" });
    await render(<VerifyEmailScreen />);
    await fireEvent.changeText(
      screen.getByPlaceholderText("Paste the link here"),
      "https://biletflow.kz/verify-email#token=abc%2E123"
    );
    await fireEvent.press(screen.getByText("Verify email"));
    expect(verifyEmail).toHaveBeenCalledWith("abc.123");
    expect(await screen.findByText("Your email is verified. You can sign in now.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Continue to sign in"));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("uses a token route param and shows the server's refusal", async () => {
    mockParams = { token: "from-link" };
    jest.mocked(verifyEmail).mockRejectedValue(
      new ApiError("This link is invalid, expired or already used. Request a new one.", 400, "invalid_token")
    );
    await render(<VerifyEmailScreen />);
    await fireEvent.press(screen.getByText("Verify email"));
    expect(verifyEmail).toHaveBeenCalledWith("from-link");
    expect(await screen.findByText("This link is invalid, expired or already used. Request a new one.")).toBeTruthy();
  });

  it("explains a pasted link that lost its token", async () => {
    await render(<VerifyEmailScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText("Paste the link here"), "https://biletflow.kz/verify-email");
    expect(screen.getByText(/This link is missing its token/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Verify email"));
    expect(verifyEmail).not.toHaveBeenCalled();
  });
});
