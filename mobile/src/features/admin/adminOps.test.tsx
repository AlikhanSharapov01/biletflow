import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import {
  getAdminMe,
  getCampaignDetail,
  getOrderDetail,
  getSupportCaseDetail,
  retryDelivery,
  retryJob,
  searchCampaigns,
  searchDeliveries,
  searchJobs,
  searchOrders,
  searchSupportCases,
} from "@/api/admin";
import { ApiError } from "@/api/errors";
import type { AdminCampaignRow, AdminDelivery, AdminJob, AdminOrderDetail, AdminSupportCaseRow } from "@/api/types/admin";
import { AdminSectionScreen } from "@/features/admin/AdminSectionScreen";
import { forgetPlatformAdminAnswers } from "@/features/admin/useIsPlatformAdmin";

let mockParams: Record<string, string> = { section: "inspect" };
const mockNotify = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: mockNotify }) }));
jest.mock("@/api/admin");
jest.mock("expo-crypto", () => ({ randomUUID: () => "key-1" }));
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: { id: "admin-1" }, logout: jest.fn(), login: jest.fn() }),
}));

const page = <T,>(items: T[]) => ({ items, total: items.length, limit: 25, offset: 0 });
const ORDER = "1f584efb-dcf6-4dcc-b432-a00540248dec";
const EVENT = "ad2139b9-8161-414c-ac16-d872c3c89ec6";
const supportCase: AdminSupportCaseRow = {
  id: "587b73c8-f3dc-4d94-8aee-e35ebe17dfde",
  kind: "attendee",
  category: "delivery",
  subject: "Where is my ticket",
  status: "open",
  requester_user_id: "u1",
  organization_id: "org-1",
  event_id: EVENT,
  order_id: ORDER,
  ticket_id: null,
  assigned_to_user_id: null,
  escalated_at: "2026-11-18T07:00:00Z",
  resolved_at: null,
  last_seq: 1,
  created_at: "2026-11-18T06:57:55Z",
  updated_at: "2026-11-18T06:57:55Z",
  platform_access: true,
};
const orderDetail = {
  order: {
    id: ORDER,
    event_id: "event-1",
    buyer_user_id: "aeead583-49ac-4dc2-b9d6-d8c63b5fa565",
    status: "confirmed",
    payable_minor: 400000,
    discount_minor: 0,
    processing_fee_minor: 12000,
    confirmed_at: "2026-11-18T06:57:50Z",
    items: [{ ticket_type_name: "Standard", recipient_name: "Aida", paid_minor: 400000, ticket: { status: "valid" } }],
    payment: { status: "succeeded", environment: "simulation" },
    refunds: [],
  },
  support_cases: [{ id: supportCase.id, kind: "attendee", category: "delivery", status: "open", escalated_at: null, created_at: "2026-11-18T06:57:55Z" }],
  deliveries: [{ id: "d1", ticket_id: "76b10271-80fc", status: "dead", attempt_count: 5, last_error: "smtp_unavailable", created_at: "2026-11-18T06:57:50Z", completed_at: null }],
  audit: [
    { id: "a1", action: "checkout.order_confirmed", entity_type: "ticket_order", entity_id: ORDER, actor_user_id: null, service_actor: "payments", created_at: "2026-11-18T06:57:50Z" },
  ],
} as unknown as AdminOrderDetail;

const job = (over: Partial<AdminJob>): AdminJob => ({
  id: "job-1",
  kind: "ticket_delivery_email",
  status: "dead",
  attempt_count: 5,
  max_attempts: 5,
  admin_retry_count: 0,
  last_error: "smtp_unavailable",
  available_at: "2026-11-18T06:00:00Z",
  lease_until: null,
  created_at: "2026-11-18T06:00:00Z",
  completed_at: null,
  event_id: "event-1",
  context: { ticket_id: "76b10271-80fc-42b6-bb57-1fa77a29853d" },
  retryable: true,
  ...over,
});

// The reason dialog's confirm button shares its label with the row button; it is the last one.
async function giveReason(reason: string, confirm: string) {
  const inputs = screen.getAllByDisplayValue("");
  await fireEvent.changeText(inputs[inputs.length - 1]!, reason);
  await fireEvent.press(screen.getAllByRole("button", { name: confirm }).at(-1)!);
}

describe("admin operations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetPlatformAdminAnswers();
    jest.mocked(getAdminMe).mockResolvedValue({ user_id: "admin-1", is_platform_admin: true });
    jest.mocked(searchSupportCases).mockResolvedValue(page([supportCase]));
  });

  it("lists support cases and opens a read-only case with its order", async () => {
    mockParams = { section: "inspect" };
    jest.mocked(getSupportCaseDetail).mockResolvedValue({
      case: supportCase,
      viewer_roles: [],
      message_count: 3,
      history: [
        { seq: 2, change_kind: "status", before_value: "open", after_value: "in_progress", reason: "Looking", actor_user_id: "s1", created_at: "2026-11-18T07:00:00Z" },
      ],
      order: { id: ORDER, status: "confirmed" },
      ticket: null,
    });
    jest.mocked(getOrderDetail).mockResolvedValue(orderDetail);
    await render(<AdminSectionScreen />);
    expect(await screen.findByText("Where is my ticket")).toBeTruthy();
    expect(screen.getByText("Case 587b73c8 · event ad2139b9 · order 1f584efb")).toBeTruthy();
    expect(searchSupportCases).toHaveBeenCalledWith({}, 25, 0);

    await fireEvent.press(screen.getByText("Details"));
    expect(await screen.findByText("3")).toBeTruthy();
    expect(getSupportCaseDetail).toHaveBeenCalledWith(supportCase.id);
    expect(screen.getByText(/status: open → in progress \(Looking\)/)).toBeTruthy();
    expect(screen.getByText("Message text and attachments are not shown here.")).toBeTruthy();

    await fireEvent.press(screen.getByText("Order details"));
    expect(await screen.findByText("Standard · Aida · ₸4000.00 · valid")).toBeTruthy();
    expect(getOrderDetail).toHaveBeenCalledWith(ORDER);
    expect(screen.getByText(/dead · 5 attempts · smtp_unavailable/)).toBeTruthy();
    expect(screen.getByText(/checkout.order confirmed · payments/)).toBeTruthy();
  });

  it("filters by event, refusing a partial id before asking the server", async () => {
    mockParams = { section: "inspect" };
    await render(<AdminSectionScreen />);
    await screen.findByText("Where is my ticket");
    await fireEvent.press(screen.getByText("▸ Filters"));
    await fireEvent.changeText(screen.getByLabelText("Event ID"), "ad2139b9");
    await fireEvent.press(screen.getByText("Apply"));
    expect(screen.getByText("Enter the full ID (36 characters).")).toBeTruthy();
    expect(searchSupportCases).toHaveBeenCalledTimes(1);

    await fireEvent.changeText(screen.getByLabelText("Event ID"), EVENT);
    await fireEvent.changeText(screen.getByLabelText("Search"), "ticket");
    await fireEvent.press(screen.getByText("Apply"));
    await waitFor(() => expect(searchSupportCases).toHaveBeenLastCalledWith({ q: "ticket", event_id: EVENT }, 25, 0));
  });

  it("shows a campaign with its code and reconciled report", async () => {
    mockParams = { section: "inspect" };
    const campaign: AdminCampaignRow = {
      id: "camp-1",
      event_id: EVENT,
      organization_id: "org-1",
      name: "Spring",
      discount_kind: "percentage",
      percentage_bps: 1000,
      fixed_minor: null,
      starts_at: "2026-11-18T05:00:00Z",
      ends_at: "2026-11-20T06:00:00Z",
      max_redemptions: null,
      is_enabled: true,
      created_at: "2026-11-18T06:00:00Z",
      redemptions: 2,
      active_reservations: 1,
    };
    jest.mocked(searchCampaigns).mockResolvedValue(page([campaign]));
    jest.mocked(getCampaignDetail).mockResolvedValue({
      campaign,
      code: "SPRING10",
      report: { redemptions: 2, tickets: 3, tickets_kept: 2, tickets_refunded: 1, discount_minor: 80000, collected_minor: 720000, refunds_minor: 240000, net_minor: 460000 },
      redemptions: [{ order_id: ORDER, discount_minor: 40000, created_at: "2026-11-18T08:00:00Z" }],
      reservations: { active: 1 },
    } as never);
    await render(<AdminSectionScreen />);
    await screen.findByText("Where is my ticket");
    await fireEvent.press(screen.getByText("Campaigns"));
    expect(await screen.findByText("Spring")).toBeTruthy();
    expect(screen.getByText(/^10% · /)).toBeTruthy();
    await fireEvent.press(screen.getByText("Details"));
    expect(await screen.findByText("SPRING10")).toBeTruthy();
    expect(screen.getByText("3 sold · 2 kept · 1 refunded")).toBeTruthy();
    expect(screen.getByText(/Order 1f584efb · −₸400.00/)).toBeTruthy();
  });

  it("retries a dead job with a reason and reloads the list", async () => {
    mockParams = { section: "work" };
    jest
      .mocked(searchJobs)
      .mockResolvedValue(page([job({}), job({ id: "job-2", kind: "notification_fanout", status: "done", retryable: false, last_error: null, context: {} })]));
    jest.mocked(retryJob).mockResolvedValue(job({ status: "pending", retryable: false }));
    await render(<AdminSectionScreen />);
    expect(await screen.findByText("ticket_delivery_email")).toBeTruthy();
    expect(screen.getByText("Last error: smtp_unavailable\nTicket 76b10271")).toBeTruthy();
    // Only the exhausted row offers a retry.
    expect(screen.getAllByText("Retry")).toHaveLength(1);

    await fireEvent.press(screen.getByText("Retry"));
    await giveReason("SMTP is back", "Retry");
    await waitFor(() => expect(retryJob).toHaveBeenCalledWith("job-1", "SMTP is back", "key-1"));
    expect(mockNotify).toHaveBeenCalledWith("Sent back to the worker.");
    await waitFor(() => expect(searchJobs).toHaveBeenCalledTimes(2));
  });

  it("explains a refused delivery retry", async () => {
    mockParams = { section: "work" };
    jest.mocked(searchJobs).mockResolvedValue(page([]));
    const delivery: AdminDelivery = {
      id: "del-1",
      notification_id: "n1",
      kind: "payment_failed",
      channel: "email",
      status: "failed",
      attempt_count: 5,
      max_attempts: 5,
      admin_retry_count: 0,
      last_error: "email_delivery_failed",
      next_attempt_at: null,
      sent_at: null,
      provider_message_id: null,
      created_at: "2026-11-18T06:00:00Z",
      recipient_user_id: "2f3fea55-442d-4c32-95b7-e48eedfa418e",
      event_id: "event-1",
      target: { type: "order", id: ORDER },
      retryable: true,
    };
    jest.mocked(searchDeliveries).mockResolvedValue(page([delivery]));
    jest.mocked(retryDelivery).mockRejectedValue(new ApiError("What this was about has changed, so sending it now would be wrong.", 409, "target_obsolete"));
    await render(<AdminSectionScreen />);
    await fireEvent.press(await screen.findByText("Deliveries"));
    expect(await screen.findByText("payment_failed")).toBeTruthy();
    expect(screen.getByText(/^Email · 5 of 5 attempts/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Retry"));
    await giveReason("Try once more", "Retry");
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith("What this was about has changed, so sending it now would be wrong."));
    expect(retryDelivery).toHaveBeenCalledWith("del-1", "Try once more", "key-1");
  });

  it("opens an order's read-only detail from the order search", async () => {
    mockParams = { section: "orders" };
    jest.mocked(searchOrders).mockResolvedValue(
      page([
        {
          id: ORDER,
          event_id: "event-1-long-id",
          buyer_user_id: "u1",
          buyer_email: "aida@example.com",
          status: "confirmed",
          gross_minor: 400000,
          discount_minor: 0,
          payable_minor: 400000,
          processing_fee_minor: 12000,
          created_at: "2026-11-18T06:57:50Z",
        },
      ]) as never,
    );
    jest.mocked(getOrderDetail).mockResolvedValue(orderDetail);
    await render(<AdminSectionScreen />);
    await fireEvent.press(await screen.findByText("Details"));
    expect(await screen.findByText("Standard · Aida · ₸4000.00 · valid")).toBeTruthy();
    expect(getOrderDetail).toHaveBeenCalledWith(ORDER);
  });
});
