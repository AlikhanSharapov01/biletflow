// Shared test fixtures for the web client (QA-owned). Each builder returns a
// complete, valid object mirroring the backend schema; tests override only the
// fields they care about.
import { vi } from "vitest";
import type { Allocation, EventView, Hold, Order, OrderItem, Profile, TicketType } from "../../src/api/types";
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
    payment: null,
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
