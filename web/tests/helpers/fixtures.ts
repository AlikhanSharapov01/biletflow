// Shared test fixtures for the web client (QA-owned). Each builder returns a
// complete, valid object mirroring the backend schema; tests override only the
// fields they care about.
import { vi } from "vitest";
import type { Allocation, EventImage, EventView, Hold, Order, OrderItem, Profile, TicketType } from "../../src/api/types";
import type { EventAnalytics } from "../../src/api/types/analytics";
import type { EventFinance, Payout } from "../../src/api/types/finance";
import type { EventSeat } from "../../src/api/types/checkout";
import type { PaymentSummary } from "../../src/api/types/payments";
import type { AuthContextValue } from "../../src/features/auth/AuthContext";

export function makeEvent(overrides: Partial<EventView> = {}): EventView {
  return {
    id: "e1",
    created_at: "2026-10-01T00:00:00Z",
    organization_id: "o1",
    publication_state: "published",
    moderation_state: "normal",
    calendar_uid: "uid",
    calendar_sequence: 0,
    availability_version: 1,
    updated_at: "2026-10-01T00:00:00Z",
    time_status: "upcoming",
    category_id: "c1",
    venue_id: "v1",
    title: "Demo night",
    description: "",
    visibility: "public",
    seating_mode: "general",
    capacity: 50,
    starts_at: "2099-11-01T18:00:00Z",
    ends_at: "2099-11-01T21:00:00Z",
    time_zone: "Asia/Almaty",
    registration_opens_at: "2026-10-01T00:00:00Z",
    registration_closes_at: "2099-11-01T18:00:00Z",
    admission_opens_at: "2099-11-01T18:00:00Z",
    admission_closes_at: "2099-11-01T21:00:00Z",
    refund_allowed: false,
    refund_cutoff_at: null,
    images: [],
    cover_image_url: null,
    ...overrides,
  };
}

// Sales window is wide open around "now" so the type is purchasable by default.
export function makeTicketType(overrides: Partial<TicketType> = {}): TicketType {
  return {
    id: "t1",
    created_at: "2026-10-01T00:00:00Z",
    event_id: "e1",
    name: "General",
    description: "",
    kind: "free",
    price_minor: 0,
    quantity_limit: 20,
    per_order_limit: 3,
    sales_open_at: "2000-01-01T00:00:00Z",
    sales_close_at: "2099-01-01T00:00:00Z",
    is_hidden: false,
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "u1",
    email: "aida@example.com",
    display_name: "Aida Sarsen",
    locale: "en",
    email_verified_at: "2026-10-01T00:00:00Z",
    analytics_consent: false,
    ...overrides,
  };
}

export function makeAllocation(overrides: Partial<Allocation> = {}): Allocation {
  return { id: "a1", ticket_type_id: "t1", event_seat_id: null, state: "held", ...overrides };
}

export function makeHold(overrides: Partial<Hold> = {}): Hold {
  return {
    id: "h1",
    event_id: "e1",
    buyer_user_id: "u1",
    status: "active",
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    created_at: "2026-10-26T12:00:00Z",
    allocations: [makeAllocation()],
    pricing: { gross: 0, discount: 0, subtotal: 0, processing_fee: 0, payable: 0, lines: [] },
    promo: null,
    ...overrides,
  };
}

export function makePayment(overrides: Partial<PaymentSummary> = {}): PaymentSummary {
  return {
    id: "p1",
    status: "created",
    charged_minor: 0,
    environment: "simulation",
    provider_payment_id: null,
    simulated: true,
    ...overrides,
  };
}

export function makeOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "i1",
    unit_number: 1,
    ticket_type_id: "t1",
    ticket_type_name: "General",
    recipient_name: "Aida Sarsen",
    recipient_email: "aida@example.com",
    face_value_minor: 0,
    discount_minor: 0,
    paid_minor: 0,
    seat_snapshot: null,
    ticket: null,
    ...overrides,
  };
}

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord1",
    event_id: "e1",
    buyer_user_id: "u1",
    hold_id: "h1",
    status: "confirmed",
    currency: "KZT",
    gross_minor: 0,
    discount_minor: 0,
    payable_minor: 0,
    processing_fee_minor: 0,
    confirmed_at: "2026-10-26T12:05:00Z",
    created_at: "2026-10-26T12:00:00Z",
    items: [],
    quote_expires_at: new Date(Date.now() + 600_000).toISOString(),
    refunds: [],
    payment: null,
    promo: null,
    ...overrides,
  };
}

export function makeSeat(overrides: Partial<EventSeat> = {}): EventSeat {
  return {
    id: "s1",
    created_at: "2026-10-01T00:00:00Z",
    event_id: "e1",
    layout_id: "l1",
    venue_seat_id: "vs1",
    ticket_type_id: "t1",
    section_label: "A",
    row_label: "1",
    seat_label: "1",
    is_blocked: false,
    x: 0,
    y: 0,
    is_accessible: false,
    status: "available",
    paid_activation_required: false,
    ...overrides,
  };
}

export function makeAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "anonymous",
    profile: null,
    notice: "",
    signIn: vi.fn(),
    register: vi.fn(),
    signOut: vi.fn(),
    signOutEverywhere: vi.fn(),
    setProfile: vi.fn(),
    clearNotice: vi.fn(),
    ...overrides,
  };
}

// Promise whose settlement the test controls, for loading-state assertions.
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function makeImage(overrides: Partial<EventImage> = {}): EventImage {
  return {
    id: "img1",
    url: "/api/v1/events/e1/images/img1/content",
    alt_text: "Main stage",
    sort_order: 0,
    is_cover: true,
    mime_type: "image/png",
    size_bytes: 2048,
    ...overrides,
  };
}

export function makeAnalytics(overrides: Partial<EventAnalytics> = {}): EventAnalytics {
  return {
    event_id: "e1",
    timezone: "Asia/Almaty",
    generated_at: "2026-11-09T10:00:00Z",
    filters: { from: null, to: null, ticket_type_id: null, campaign_id: null },
    definitions: {},
    inventory: { capacity: 100, sold: 25, held: 3, expired_held: 0, available: 72, blocked: 0, refund_pending: 0, sold_percentage: 25 },
    revenue: {
      currency: "KZT", environments: ["simulation"], simulated: true,
      gross_minor: 1_000_000, discount_minor: 100_000, fulfilled_collected_minor: 900_000, collected_minor: 900_000,
      charged_fees_minor: 27_000, fee_reversals_minor: 0, fees_minor: 27_000, refunds_minor: 0, pending_refunds_minor: 0, net_minor: 873_000,
    },
    attendance: { issued: 25, checked_in: 10, not_checked_in: 15, not_checked_in_label: "not_yet_checked_in", percentage: 40 },
    by_ticket_type: [{ ticket_type_id: "t1", name: "Standard", capacity: 100, sold: 25, checked_in: 10, revenue_minor: 873_000 }],
    by_campaign: [],
    ...overrides,
  };
}

export function makeFinance(overrides: Partial<EventFinance> = {}): EventFinance {
  return {
    event_id: "e1", currency: "KZT", simulated: true, simulation_only: true, environments: ["simulation"],
    gross_minor: 1_200_000, discount_minor: 0, collected_minor: 1_200_000, fulfilled_collected_minor: 1_200_000,
    charged_fees_minor: 36_000, fee_reversals_minor: 0, fees_minor: 36_000, refunds_minor: 0, pending_refunds_minor: 0,
    activation_charges_minor: 500_000, activation_refunds_minor: 0, pending_activation_refunds_minor: 0,
    net_minor: 664_000, balance_minor: 664_000, reserved_minor: 0, sent_minor: 0, estimated_payout_minor: 664_000,
    payout_eligible_at: "2026-11-01T21:00:00Z", generated_at: "2026-11-09T10:00:00Z",
    ...overrides,
  };
}

export function makePayout(overrides: Partial<Payout> = {}): Payout {
  return {
    id: "p1", event_id: "e1", organization_id: "o1", payout_profile_id: "pp1", requested_by_user_id: "u1",
    amount_minor: 664_000, currency: "KZT", environment: "simulation", simulated: true,
    status: "pending", transfer_status: "pending", adjustment_minor: 0, sent_at: null, created_at: "2026-11-09T10:00:00Z",
    ...overrides,
  };
}
