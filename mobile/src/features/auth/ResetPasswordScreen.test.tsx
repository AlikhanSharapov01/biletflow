import { fireEvent, render, screen } from "@testing-library/react-native";

import { resetPassword } from "@/api/account";
import { ResetPasswordScreen } from "@/features/auth/ResetPasswordScreen";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ token: "reset-token" }),
}));
jest.mock("@/api/account");

describe("ResetPasswordScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses two different passwords", async () => {
    await render(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText("At least 12 characters"), "correct horse battery");
    const inputs = screen.getAllByDisplayValue("");
    await fireEvent.changeText(inputs[inputs.length - 1], "something else entirely");
    await fireEvent.press(screen.getByText("Set new password"));
    expect(screen.getByText("The two passwords do not match.")).toBeTruthy();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("sets the new password with the link token, then offers sign in", async () => {
    jest.mocked(resetPassword).mockResolvedValue({ code: "password_reset" });
    await render(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText("At least 12 characters"), "correct horse battery");
    const inputs = screen.getAllByDisplayValue("");
    await fireEvent.changeText(inputs[inputs.length - 1], "correct horse battery");
    await fireEvent.press(screen.getByText("Set new password"));
    expect(resetPassword).toHaveBeenCalledWith("reset-token", "correct horse battery");
    expect(await screen.findByText("Password changed. Every other session was signed out.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Sign in with the new password"));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});
