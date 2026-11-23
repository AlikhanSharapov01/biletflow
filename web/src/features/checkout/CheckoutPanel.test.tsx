import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProfile, resendVerification } from "../../api/auth";
import type { Profile } from "../../api/types";
import { AuthContext } from "../auth/AuthContext";
import { makeAuthValue, makeEvent, makeProfile, makeTicketType } from "../../../tests/helpers/fixtures";
import { CheckoutPanel } from "./CheckoutPanel";

vi.mock("../../api/auth", () => ({ resendVerification: vi.fn(), getProfile: vi.fn() }));

afterEach(() => vi.clearAllMocks());

function Harness({ initial }: { initial: Profile }) {
  const [profile, setProfile] = useState(initial);
  const auth = makeAuthValue({ status: "authenticated", profile, setProfile });
  return (
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <h2 id="tickets" tabIndex={-1}>Tickets</h2>
        <CheckoutPanel event={makeEvent()} tickets={[makeTicketType()]} />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

const unverified = () => makeProfile({ email_verified_at: null });

describe("CheckoutPanel email verification", () => {
  it("offers to resend the link to an unverified user and sends their email once", async () => {
    vi.mocked(resendVerification).mockResolvedValue({ code: "ok" });
    render(<Harness initial={unverified()} />);
    fireEvent.click(screen.getByRole("button", { name: "Resend email" }));
    await screen.findByText("We sent a new link to aida@example.com.");
    expect(resendVerification).toHaveBeenCalledTimes(1);
    expect(resendVerification).toHaveBeenCalledWith("aida@example.com");
  });

  it("does not show the prompt to a verified user", () => {
    render(<Harness initial={makeProfile()} />);
    expect(screen.queryByRole("button", { name: "Resend email" })).toBeNull();
    expect(screen.queryByRole("button", { name: "I’ve confirmed my email" })).toBeNull();
  });

  it("moves on to ticket selection once the reloaded profile is verified", async () => {
    vi.mocked(getProfile).mockResolvedValue(makeProfile());
    render(<Harness initial={unverified()} />);
    fireEvent.click(screen.getByRole("button", { name: "I’ve confirmed my email" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Resend email" })).toBeNull());
    expect(screen.queryByText(/Verify your email address/)).toBeNull();
    expect(screen.getByRole("button", { name: "Reserve tickets" })).toBeTruthy();
    expect(screen.getByLabelText("Quantity for General")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("tickets")));
  });

  it("says so when the reloaded profile is still unverified", async () => {
    vi.mocked(getProfile).mockResolvedValue(unverified());
    render(<Harness initial={unverified()} />);
    fireEvent.click(screen.getByRole("button", { name: "I’ve confirmed my email" }));
    expect((await screen.findByRole("status")).textContent).toBe("Your email isn’t confirmed yet.");
    expect(screen.getByRole("button", { name: "Resend email" })).toBeTruthy();
  });
});
