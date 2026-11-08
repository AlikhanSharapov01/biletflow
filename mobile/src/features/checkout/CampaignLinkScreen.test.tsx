import { render, screen, waitFor } from "@testing-library/react-native";

import { ApiError } from "@/api/errors";
import { resolveCampaignLink } from "@/api/promo";
import { CampaignLinkScreen } from "@/features/checkout/CampaignLinkScreen";
import { readStashedPromo } from "@/features/checkout/utils/promo";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ token: "camp-1" }),
}));
jest.mock("@/api/promo");

describe("CampaignLinkScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("opens the event with the campaign's promo code", async () => {
    jest.mocked(resolveCampaignLink).mockResolvedValue({ event_id: "e7", code: "SPRING" });
    await render(<CampaignLinkScreen />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/events/[eventId]", params: { eventId: "e7", promo: "SPRING" } }),
    );
    expect(resolveCampaignLink).toHaveBeenCalledWith("camp-1");
    expect(readStashedPromo("e7")).toBe("SPRING");
  });

  it("says campaign links are not available yet while the server lacks them", async () => {
    jest.mocked(resolveCampaignLink).mockRejectedValue(new ApiError("Not Found", 404));
    await render(<CampaignLinkScreen />);
    expect(await screen.findByText("Campaign links is coming soon.")).toBeTruthy();
    expect(screen.getByText("Browse events")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
