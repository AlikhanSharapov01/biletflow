import type { Message } from "../../../api/types/common";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resendVerification } from "../../../api/auth";
import { ApiError, failureMessage } from "../../../api/errors";
import { VerifyEmailPrompt } from "./VerifyEmailPrompt";

vi.mock("../../../api/auth", () => ({ resendVerification: vi.fn() }));
const resendMock = vi.mocked(resendVerification);

afterEach(() => resendMock.mockReset());

const resendButton = () => screen.getByRole("button", { name: "Resend email" }) as HTMLButtonElement;

describe("VerifyEmailPrompt", () => {
  it("shows the hint and a resend button", () => {
    render(<VerifyEmailPrompt email="aida@example.com" />);
    expect(screen.getByText(/Verify your email address before reserving tickets/)).toBeTruthy();
    expect(resendButton().disabled).toBe(false);
  });

  it("sends the profile email once and is busy while sending", async () => {
    let finish: (value: Message) => void = () => {};
    resendMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<VerifyEmailPrompt email="aida@example.com" />);
    fireEvent.click(resendButton());
    fireEvent.click(resendButton());
    expect(resendMock).toHaveBeenCalledTimes(1);
    expect(resendMock).toHaveBeenCalledWith("aida@example.com");
    expect(resendButton().disabled).toBe(true);
    expect(resendButton().getAttribute("aria-busy")).toBe("true");
    finish({ code: "ok" });
    await waitFor(() => expect(resendButton().disabled).toBe(false));
  });

  it("confirms the address on success and keeps the button available", async () => {
    resendMock.mockResolvedValue({ code: "ok" });
    render(<VerifyEmailPrompt email="aida@example.com" />);
    fireEvent.click(resendButton());
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("We sent a new link to aida@example.com.");
    expect(resendButton().disabled).toBe(false);
  });

  it("shows the translated failure, including rate limits", async () => {
    resendMock.mockRejectedValue(new ApiError(failureMessage("rate_limited", 429), 429, "rate_limited"));
    render(<VerifyEmailPrompt email="aida@example.com" />);
    fireEvent.click(resendButton());
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("Too many attempts. Please wait a moment and try again.")
    expect(resendButton().disabled).toBe(false);
  });
});
