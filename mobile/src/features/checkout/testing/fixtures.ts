// Sample records for the discover, event and checkout screen tests.
import type { Category, EventView, Hold, Order, TicketType, Venue } from "@/api/types";

export const sampleEvent: EventView = {
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
  title: "Almaty Jazz Night",
  description: "An evening of live jazz.",
  visibility: "public",
  seating_mode: "general",
  capacity: 50,
  starts_at: "2099-11-01T18:00:00Z",
  ends_at: "2099-11-01T21:00:00Z",
  time_zone: "Asia/Almaty",
  registration_opens_at: "2020-10-01T00:00:00Z",
  registration_closes_at: "2099-11-01T18:00:00Z",
  admission_opens_at: "2099-11-01T18:00:00Z",
  admission_closes_at: "2099-11-01T21:00:00Z",
  refund_allowed: false,
  refund_cutoff_at: null,
};

export function sampleTicket(overrides: Partial<TicketType> = {}): TicketType {
  return {
    id: "t1",
    created_at: "2026-10-01T00:00:00Z",
    event_id: "e1",
    name: "General",
    description: "",
    kind: "free",
    price_minor: 0,
    quantity_limit: 20,
    per_order_limit: 5,
    sales_open_at: "2020-10-01T00:00:00Z",
    sales_close_at: "2099-11-01T18:00:00Z",
    is_hidden: false,
    ...overrides,
  };
}

export const sampleCategory: Category = { id: "c1", created_at: "2026-10-01T00:00:00Z", code: "music", name_kk: "Музыка", name_ru: "Музыка", name_en: "Music" };

export const sampleVenue: Venue = { id: "v1", created_at: "2026-10-01T00:00:00Z", name: "Jazz Club", address: "Abay 1", city: "Almaty", country_code: "KZ" };

export const sampleProfile = {
  id: "u1",
  email: "aru@example.com",
  display_name: "Aru Nurlan",
  locale: "en" as const,
  email_verified_at: "2026-01-01T00:00:00Z",
  analytics_consent: false,
};

export function sampleHold(allocationIds: string[], ticketTypeId = "t1", payableMinor = 0): Hold {
  return {
    id: "h1",
    event_id: "e1",
    buyer_user_id: "u1",
    status: "active",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    allocations: allocationIds.map((id) => ({ id, ticket_type_id: ticketTypeId, event_seat_id: null, state: "held" })),
    pricing: { gross: payableMinor, discount: 0, subtotal: payableMinor, processing_fee: 0, payable: payableMinor, lines: [] },
    promo: null,
  };
}

export function sampleOrder(overrides: Partial<Order> = {}): Order {
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
    quote_expires_at: "2099-11-01T10:15:00Z",
    refunds: [],
    promo: null,
    confirmed_at: "2026-11-01T10:00:00Z",
    created_at: "2026-11-01T10:00:00Z",
    items: [],
    payment: null,
    ...overrides,
  };
}
