import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getGa4Connection, setGa4Connection } from "../../../api/analytics";
import { ApiError } from "../../../api/errors";
import type { Organization } from "../../../api/types";
import type { Ga4Connection } from "../../../api/types/analytics";
import { Ga4ConnectionPanel } from "./Ga4ConnectionPanel";

vi.mock("../../../api/analytics", () => ({ getGa4Connection: vi.fn(), setGa4Connection: vi.fn() }));
afterEach(() => vi.clearAllMocks());

const organization: Organization = {
  id: "o1", created_at: "2026-10-01T00:00:00Z", owner_user_id: "u1", name: "Campus Club",
  contact_email: "club@example.com", contact_phone: null, status: "active",
};
const connection = (over: Partial<Ga4Connection>): Ga4Connection => ({
  organization_id: "o1", property_id: null, is_enabled: false, enabled_at: null, integration: "enabled", ...over,
});

describe("GA4 connection", () => {
  it("says GA4 is off for the platform and offers no switch", async () => {
    vi.mocked(getGa4Connection).mockResolvedValue(connection({ integration: "disabled" }));
    render(<Ga4ConnectionPanel organization={organization} />);
    expect(await screen.findByText("Google Analytics is turned off on this platform, so there is nothing to connect.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect Google Analytics" })).toBeNull();
    expect(getGa4Connection).toHaveBeenCalledWith("o1");
  });

  it("connects, then shows since when and offers to disconnect", async () => {
    vi.mocked(getGa4Connection)
      .mockResolvedValueOnce(connection({}))
      .mockResolvedValue(connection({ is_enabled: true, property_id: "123", enabled_at: "2026-11-20T09:00:00Z" }));
    vi.mocked(setGa4Connection).mockResolvedValue(connection({ is_enabled: true, property_id: "123", enabled_at: "2026-11-20T09:00:00Z" }));
    render(<Ga4ConnectionPanel organization={organization} />);
    expect(await screen.findByText("Not connected")).toBeTruthy();
    expect(screen.getByText(/Earlier orders are not sent/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect Google Analytics" }));
    await waitFor(() => expect(setGa4Connection).toHaveBeenCalledWith("o1", true));
    expect(await screen.findByText(/^Connected since /)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
  });

  it("disconnects a connected organization", async () => {
    vi.mocked(getGa4Connection).mockResolvedValue(connection({ is_enabled: true, enabled_at: "2026-11-20T09:00:00Z" }));
    vi.mocked(setGa4Connection).mockResolvedValue(connection({}));
    render(<Ga4ConnectionPanel organization={organization} />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(setGa4Connection).toHaveBeenCalledWith("o1", false));
  });

  it("explains the server's refusal", async () => {
    vi.mocked(getGa4Connection).mockResolvedValue(connection({}));
    vi.mocked(setGa4Connection).mockRejectedValue(new ApiError("Google Analytics is turned off on this platform, so it can’t be connected.", 409, "ga4_disabled"));
    render(<Ga4ConnectionPanel organization={organization} />);
    fireEvent.click(await screen.findByRole("button", { name: "Connect Google Analytics" }));
    expect(await screen.findByText("Google Analytics is turned off on this platform, so it can’t be connected.")).toBeTruthy();
  });
});
