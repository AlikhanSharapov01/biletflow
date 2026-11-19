import { render, screen, waitFor } from "@testing-library/react-native";

import { ApiError } from "@/api/errors";
import { postMeasurement } from "@/api/analytics";
import { resolveCampaignLink } from "@/api/promo";
import { CampaignLinkScreen } from "@/features/checkout/CampaignLinkScreen";
import { readStashedPromo } from "@/features/checkout/utils/promo";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ token: "camp-1" }),
}));
jest.mock("@/api/promo");
jest.mock("@/api/analytics", () => ({ postMeasurement: jest.fn(async () => ({ status: "accepted", reason: null })) }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "measure-1" }));
let mockConsent = false;
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: { id: "u1", analytics_consent: mockConsent } }),
}));

describe("CampaignLinkScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConsent = false;
  });

  it("opens the event with the campaign's promo code", async () => {
    jest.mocked(resolveCampaignLink).mockResolvedValue({ event_id: "e7", code: "SPRING" });
    await render(<CampaignLinkScreen />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/events/[eventId]", params: { eventId: "e7", promo: "SPRING" } }),
    );
    expect(resolveCampaignLink).toHaveBeenCalledWith("camp-1");
    expect(readStashedPromo("e7")).toBe("SPRING");
    // No consent: nothing is measured.
    expect(postMeasurement).not.toHaveBeenCalled();
  });

  it("reports the campaign landing through the backend once the person consented", async () => {
    mockConsent = true;
    jest.mocked(resolveCampaignLink).mockResolvedValue({ event_id: "e7", code: "SPRING" });
    await render(<CampaignLinkScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(postMeasurement).toHaveBeenCalledWith({
      name: "campaign_landing",
      analytics_event_id: "measure-1",
      event_id: "e7",
      platform: "mobile",
      page_path: "/c/campaign",
    });
  });

  it("explains a link that does not resolve", async () => {
    jest.mocked(resolveCampaignLink).mockRejectedValue(new ApiError("That promo code doesn’t exist.", 404, "promo_not_found"));
    await render(<CampaignLinkScreen />);
    expect(await screen.findByText("This campaign link doesn’t work.")).toBeTruthy();
    expect(screen.getByText("That promo code doesn’t exist.")).toBeTruthy();
    expect(screen.getByText("Browse events")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
