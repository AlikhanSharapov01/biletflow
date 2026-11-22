import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/AuthContext";
import { makeAuthValue, makeEvent, makeProfile, makeTicketType } from "../../../tests/helpers/fixtures";
import { CheckoutPanel } from "./CheckoutPanel";

vi.mock("../../api/auth", () => ({ resendVerification: vi.fn() }));

function mount(emailVerifiedAt: string | null) {
  const auth = makeAuthValue({ status: "authenticated", profile: makeProfile({ email_verified_at: emailVerifiedAt }) });
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <CheckoutPanel event={makeEvent()} tickets={[makeTicketType()]} />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("CheckoutPanel email verification", () => {
  it("offers to resend the link to an unverified user", () => {
    mount(null);
    expect(screen.getByRole("button", { name: "Resend email" })).toBeTruthy();
  });

  it("does not show the prompt to a verified user", () => {
    mount("2026-10-01T00:00:00Z");
    expect(screen.queryByRole("button", { name: "Resend email" })).toBeNull();
  });
});
