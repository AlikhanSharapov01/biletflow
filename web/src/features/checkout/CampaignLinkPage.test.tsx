import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useSearchParams } from "react-router";
import { postMeasurement } from "../../api/analytics";
import { resolveCampaignLink } from "../../api/promo";
import { ApiError } from "../../api/errors";
import { AuthContext } from "../auth/AuthContext";
import { makeAuthValue, makeEvent, makeProfile } from "../../../tests/helpers/fixtures";
import { CampaignLinkPage } from "./CampaignLinkPage";
import { CheckoutPanel } from "./CheckoutPanel";
import { initialPromo } from "./utils/promo";

vi.mock("../../api/promo", () => ({ resolveCampaignLink: vi.fn() }));
vi.mock("../../api/analytics", () => ({ postMeasurement: vi.fn(async () => ({ status: "accepted", reason: null })) }));
afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

function Event() {
  const [query] = useSearchParams();
  return <CheckoutPanel event={makeEvent()} tickets={[]} promoFromUrl={query.get("promo")} />;
}
function SignIn() {
  const location = useLocation();
  return <p>Return to {(location.state as { from: string }).from}</p>;
}
function mount(auth = makeAuthValue()) {
  render(<AuthContext.Provider value={auth}>
    <MemoryRouter initialEntries={["/c/opaque-token"]}>
      <Routes>
        <Route path="/c/:token" element={<CampaignLinkPage />} />
        <Route path="/events/:eventId" element={<Event />} />
        <Route path="/sign-in" element={<SignIn />} />
      </Routes>
    </MemoryRouter>
  </AuthContext.Provider>);
}

describe("campaign link and sign-in", () => {
  it("resolves the opaque token and preserves the code through sign-in", async () => {
    vi.mocked(resolveCampaignLink).mockResolvedValue({ event_id: "e1", code: "DEMO10" });
    mount();
    fireEvent.click(await screen.findByRole("link", { name: "Sign in" }));
    expect(screen.getByText("Return to /events/e1?promo=DEMO10")).toBeTruthy();
    expect(initialPromo("e1", null)).toBe("DEMO10");
    expect(resolveCampaignLink).toHaveBeenCalledWith("opaque-token");
    // An anonymous visitor is never measured.
    expect(postMeasurement).not.toHaveBeenCalled();
  });

  it("reports the campaign landing through the backend for a consenting person", async () => {
    vi.mocked(resolveCampaignLink).mockResolvedValue({ event_id: "e1", code: "DEMO10" });
    mount(makeAuthValue({ status: "authenticated", profile: makeProfile({ analytics_consent: true }) }));
    await vi.waitFor(() => expect(postMeasurement).toHaveBeenCalledTimes(1));
    expect(vi.mocked(postMeasurement).mock.calls[0]![0]).toMatchObject({ name: "campaign_landing", event_id: "e1", platform: "web", page_path: "/c/campaign" });
  });

  it("shows an invalid campaign error without calling it an unreleased feature", async () => {
    vi.mocked(resolveCampaignLink).mockRejectedValue(new ApiError("That promo code doesn’t exist.", 404, "promo_not_found"));
    mount();
    expect((await screen.findByRole("alert")).textContent).toContain("That promo code doesn’t exist.");
    expect(screen.queryByText("Not available yet")).toBeNull();
  });
});
