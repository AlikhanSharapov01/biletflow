import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CredentialsForm, type AuthFeedback } from "./CredentialsForm";

const NO_FEEDBACK: AuthFeedback = { text: "", success: false };

function renderForm(overrides: Partial<Parameters<typeof CredentialsForm>[0]> = {}) {
  const props = {
    registering: false,
    busy: false,
    feedback: NO_FEEDBACK,
    canResend: false,
    onSubmit: vi.fn((event: { preventDefault: () => void }) => event.preventDefault()),
    onForgot: vi.fn(),
    onResend: vi.fn(),
    ...overrides,
  };
  render(<CredentialsForm {...props} />);
  return props;
}

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe("CredentialsForm", () => {
  it("asks for email and password to sign in", () => {
    renderForm();
    expect(input("Email address").type).toBe("email");
    expect(input("Email address").autocomplete).toBe("email");
    expect(input("Password").type).toBe("password");
    expect(input("Password").autocomplete).toBe("current-password");
    expect(screen.queryByLabelText("Your name")).toBeNull();
    expect(screen.getByRole("button", { name: /^Sign in/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeTruthy();
  });

  it("asks for a name and a 12+ character new password to register", () => {
    renderForm({ registering: true });
    expect(input("Your name").required).toBe(true);
    expect(input("Password").minLength).toBe(12);
    expect(input("Password").autocomplete).toBe("new-password");
    expect(screen.queryByRole("button", { name: "Forgot password?" })).toBeNull();
    expect(screen.getByRole("button", { name: /^Create account/ })).toBeTruthy();
  });

  it("submits the form and does not trigger forgot-password", () => {
    const props = renderForm();
    fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onForgot).not.toHaveBeenCalled();
  });

  it("passes the form to forgot-password without submitting", () => {
    const props = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(props.onForgot).toHaveBeenCalledWith(screen.getByRole("button", { name: /^Sign in/ }).closest("form"));
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("locks the submit button while busy", () => {
    renderForm({ busy: true });
    expect((screen.getByRole("button", { name: /^Signing in…/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows busy registration text", () => {
    renderForm({ busy: true, registering: true });
    expect((screen.getByRole("button", { name: /^Creating account…/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("announces errors and successes in a status region", () => {
    renderForm({ feedback: { text: "That email and password don’t match.", success: false } });
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("That email and password don’t match.");
    expect(status.className).not.toContain("success");
  });

  it("offers to resend the verification email only when asked", () => {
    const props = renderForm({ canResend: true, feedback: { text: "Please verify your email before signing in.", success: false } });
    fireEvent.click(screen.getByRole("button", { name: "Resend the verification email" }));
    expect(props.onResend).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("hides resend by default", () => {
    renderForm();
    expect(screen.queryByRole("button", { name: "Resend the verification email" })).toBeNull();
  });
});
