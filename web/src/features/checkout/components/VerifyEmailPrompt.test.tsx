import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProfile, resendVerification } from "../../../api/auth";
import { ApiError, failureMessage } from "../../../api/errors";
import type { Message } from "../../../api/types/common";
import { AuthContext } from "../../auth/AuthContext";
import { deferred, makeAuthValue, makeProfile } from "../../../../tests/helpers/fixtures";
import { VerifyEmailPrompt } from "./VerifyEmailPrompt";

vi.mock("../../../api/auth", () => ({ resendVerification: vi.fn(), getProfile: vi.fn() }));
const resendMock = vi.mocked(resendVerification);
const profileMock = vi.mocked(getProfile);

afterEach(() => {
  resendMock.mockReset();
  profileMock.mockReset();
});

function mount(setProfile = vi.fn()) {
  render(
    <AuthContext.Provider value={makeAuthValue({ status: "authenticated", setProfile })}>
      <VerifyEmailPrompt email="aida@example.com" />
    </AuthContext.Provider>,
  );
  return setProfile;
}

const resendButton = () => screen.getByRole("button", { name: /^(Resend email|Sending…)$/ }) as HTMLButtonElement;
const confirmButton = () => screen.getByRole("button", { name: /^(I’ve confirmed my email|Loading…)$/ }) as HTMLButtonElement;
const message = () => screen.getByRole("status").textContent;

describe("VerifyEmailPrompt", () => {
  it("shows the hint and both buttons", () => {
    mount();
    expect(screen.getByText(/Verify your email address before reserving tickets/)).toBeTruthy();
    expect(resendButton().getAttribute("aria-disabled")).toBe("false");
    expect(confirmButton()).toBeTruthy();
  });

  it("stays focusable and sends once while busy", async () => {
    const pending = deferred<Message>();
    resendMock.mockReturnValue(pending.promise);
    mount();
    resendButton().focus();
    fireEvent.click(resendButton());
    fireEvent.click(resendButton());
    expect(resendMock).toHaveBeenCalledTimes(1);
    expect(resendMock).toHaveBeenCalledWith("aida@example.com");
    expect(resendButton().textContent).toBe("Sending…");
    expect(resendButton().getAttribute("aria-disabled")).toBe("true");
    expect(resendButton().getAttribute("aria-busy")).toBe("true");
    expect(resendButton().disabled).toBe(false);
    expect(document.activeElement).toBe(resendButton());
    expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
    pending.resolve({ code: "ok" });
    await waitFor(() => expect(resendButton().getAttribute("aria-disabled")).toBe("false"));
    expect(resendButton().textContent).toBe("Resend email");
  });

  it("confirms the address on success and keeps the button available", async () => {
    resendMock.mockResolvedValue({ code: "ok" });
    mount();
    fireEvent.click(resendButton());
    await screen.findByText("We sent a new link to aida@example.com.");
    expect(message()).toBe("We sent a new link to aida@example.com.");
    expect(resendButton().getAttribute("aria-disabled")).toBe("false");
  });

  it("shows the translated failure, including rate limits", async () => {
    resendMock.mockRejectedValue(new ApiError(failureMessage("rate_limited", 429), 429, "rate_limited"));
    mount();
    fireEvent.click(resendButton());
    await screen.findByText("Too many attempts. Please wait a moment and try again.");
    expect(resendButton().getAttribute("aria-disabled")).toBe("false");
  });

  it("clears the message when a new attempt starts, then announces the next result", async () => {
    resendMock.mockRejectedValueOnce(new ApiError(failureMessage("rate_limited", 429), 429, "rate_limited"));
    mount();
    fireEvent.click(resendButton());
    await screen.findByText("Too many attempts. Please wait a moment and try again.");

    const pending = deferred<Message>();
    resendMock.mockReturnValueOnce(pending.promise);
    fireEvent.click(resendButton());
    expect(message()).toBe("");
    pending.reject(new ApiError(failureMessage("rate_limited", 429), 429, "rate_limited"));
    await screen.findByText("Too many attempts. Please wait a moment and try again.");

    resendMock.mockResolvedValueOnce({ code: "ok" });
    fireEvent.click(resendButton());
    await screen.findByText("We sent a new link to aida@example.com.");
    const second = deferred<Message>();
    resendMock.mockReturnValueOnce(second.promise);
    fireEvent.click(resendButton());
    expect(message()).toBe("");
    second.resolve({ code: "ok" });
    await screen.findByText("We sent a new link to aida@example.com.");
  });

  it("reloads the profile for the confirm button and reports a failure", async () => {
    const verified = makeProfile();
    profileMock.mockResolvedValueOnce(verified);
    const setProfile = mount();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(setProfile).toHaveBeenCalledWith(verified));

    profileMock.mockRejectedValueOnce(new Error("Service is unavailable."));
    fireEvent.click(confirmButton());
    await screen.findByText("Service is unavailable.");
    expect(setProfile).toHaveBeenCalledTimes(1);
  });
});
