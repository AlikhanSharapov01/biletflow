import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPage } from "./AuthPage";

const signIn = vi.fn();
vi.mock("./AuthContext", () => ({
  useAuth: () => ({ status: "anonymous", notice: "", clearNotice: vi.fn(), signIn, register: vi.fn() }),
}));
const startGoogleSignIn = vi.fn();
vi.mock("../../api/auth", () => ({
  startGoogleSignIn: () => startGoogleSignIn(),
  resendVerification: vi.fn(),
  requestPasswordReset: vi.fn(),
}));

function renderPage() {
  render(
    <MemoryRouter>
      <AuthPage />
    </MemoryRouter>,
  );
}

describe("AuthPage busy rule", () => {
  beforeEach(() => {
    signIn.mockReset();
    startGoogleSignIn.mockReset();
  });

  it("marks only Google busy while it runs and locks the email submit", async () => {
    startGoogleSignIn.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Google/ }));
    const google = screen.getByRole("button", { name: /Google/ });
    const submit = screen.getByRole("button", { name: /^Sign in/ });
    await waitFor(() => expect(google.getAttribute("aria-busy")).toBe("true"));
    expect(submit.hasAttribute("aria-busy")).toBe(false);
    expect(submit.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(submit);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("marks only the email submit busy while it runs and locks Google", async () => {
    signIn.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    const google = screen.getByRole("button", { name: /Google/ });
    await waitFor(() => expect(screen.getByRole("button", { name: /Signing in/ }).getAttribute("aria-busy")).toBe("true"));
    expect(google.hasAttribute("aria-busy")).toBe(false);
    expect(google.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(google);
    expect(startGoogleSignIn).not.toHaveBeenCalled();
  });
});
