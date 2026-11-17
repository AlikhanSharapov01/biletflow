import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../api/organizations";
import { ApiError } from "../../../api/errors";
import type { MemberDetail, Organization } from "../../../api/types";
import { MemberPermissionsForm } from "./MemberPermissionsForm";
import { OrganizationProfilePanel } from "./OrganizationProfilePanel";

vi.mock("../../../api/organizations", () => ({ updateOrganization: vi.fn(), setMemberPermissions: vi.fn() }));
afterEach(() => vi.clearAllMocks());

const organization: Organization = {
  id: "o1", created_at: "2026-10-01T00:00:00Z", owner_user_id: "u1", name: "Campus Club",
  contact_email: "club@example.com", contact_phone: null, status: "active",
};
const member: MemberDetail = {
  id: "m1", created_at: "2026-10-01T00:00:00Z", organization_id: "o1", user_id: "u2", status: "active",
  revoked_at: null, display_name: "Aru", email: "aru@example.com", capabilities: ["manage_staff"],
};

describe("organizer profile", () => {
  it("saves the edited contact details and reports a refusal", async () => {
    const onSaved = vi.fn();
    vi.mocked(api.updateOrganization).mockRejectedValueOnce(new ApiError("You do not have permission.", 403, "permission_denied")).mockResolvedValue({ ...organization, contact_phone: "+7 700" });
    render(<OrganizationProfilePanel organization={organization} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Contact phone/), { target: { value: " +7 700 " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("You do not have permission.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.updateOrganization).toHaveBeenLastCalledWith("o1", { name: "Campus Club", contact_email: "club@example.com", contact_phone: "+7 700" });
  });
});

describe("member permissions", () => {
  it("replaces the member's workspace permissions, including finance", async () => {
    const onSaved = vi.fn();
    vi.mocked(api.setMemberPermissions).mockResolvedValue({ capabilities: ["finance", "manage_staff"] });
    render(<MemberPermissionsForm organizationId="o1" member={member} onSaved={onSaved} onCancel={vi.fn()} />);
    expect((screen.getByRole("checkbox", { name: /Manage staff/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Finance/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.setMemberPermissions).toHaveBeenCalledWith("o1", "m1", ["manage_staff", "finance"]);
  });
});
