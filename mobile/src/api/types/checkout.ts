// Mirrors backend/app/checkout_schemas.py: holds, orders, issued tickets and
// attendee rows; plus seats, ticket delivery, admission and entry confirmation.
import type { PaymentSummary, RefundSummary } from "./payments";

export interface HoldLine {
  ticket_type_id: string;
  quantity: number;
  seat_ids?: string[];
}

export interface Allocation {
  id: string;
  ticket_type_id: string;
  event_seat_id: string | null;
  state: "held" | "sold" | "released" | string;
}

export interface Hold {
  id: string;
  event_id: string;
  buyer_user_id: string;
  status: "active" | "consumed" | "released" | "expired" | string;
  expires_at: string;
  created_at: string;
  allocations: Allocation[];
  pricing: Pricing;
  promo: AppliedPromo | null;
}

export interface PricingLine {
  allocation_id: string;
  ticket_type_id: string;
  face_value_minor: number;
  discount_minor: number;
  paid_minor: number;
  processing_fee_minor: number;
  campaign_eligible: boolean;
}

export interface Pricing {
  gross: number;
  discount: number;
  subtotal: number;
  processing_fee: number;
  payable: number;
  lines: PricingLine[];
}

export interface AppliedPromo {
  code: string;
  campaign_id: string;
  discount_kind: "percent" | "fixed";
  discount_value: number;
}

export interface OrderPromo {
  code: string;
  campaign_id: string;
}

export interface RecipientInput {
  allocation_id: string;
  name: string;
  email: string;
}

export interface SeatSnapshot {
  section_label: string;
  row_label: string;
  seat_label: string;
}

export type TicketStatus = "valid" | "checked_in" | "cancelled" | "refunded" | "refund_pending" | string;

export interface IssuedTicket {
  id: string;
  order_item_id: string;
  event_id: string;
  event_title: string;
  event_starts_at: string;
  venue_name: string;
  ticket_type_name: string;
  recipient_name: string;
  seat_snapshot: SeatSnapshot | null;
  status: TicketStatus;
  recipient_user_id: string | null;
  claimed_at: string | null;
  issued_at: string;
  // Present only when the signed-in user is this ticket's recipient.
  qr_payload: string | null;
}

export interface OrderItem {
  id: string;
  unit_number: number;
  ticket_type_id: string;
  ticket_type_name: string;
  recipient_name: string;
  recipient_email: string;
  face_value_minor: number;
  discount_minor: number;
  paid_minor: number;
  seat_snapshot: SeatSnapshot | null;
  ticket: IssuedTicket | null;
}

export type OrderStatus = "pending" | "confirmed" | "expired" | "cancelled" | string;

export interface Order {
  id: string;
  event_id: string;
  buyer_user_id: string;
  hold_id: string;
  status: OrderStatus;
  currency: string;
  gross_minor: number;
  discount_minor: number;
  payable_minor: number;
  processing_fee_minor: number;
  confirmed_at: string | null;
  created_at: string;
  quote_expires_at: string;
  items: OrderItem[];
  // Latest (simulated) payment attempt; null for free orders.
  payment: PaymentSummary | null;
  refunds: RefundSummary[];
  promo: OrderPromo | null;
}

export interface Attendee {
  ticket_id: string;
  order_id: string;
  ticket_type_id: string;
  ticket_type_name: string;
  recipient_name: string;
  recipient_email: string;
  seat_snapshot: SeatSnapshot | null;
  status: TicketStatus;
  claimed: boolean;
  issued_at: string;
}

export type SeatStatus = "available" | "unavailable" | "blocked" | "held" | "sold" | "refund_pending";

// GET /events/{id}/seats (catalog SeatAvailability).
export interface EventSeat {
  id: string;
  created_at: string;
  event_id: string;
  layout_id: string;
  venue_seat_id: string;
  ticket_type_id: string;
  section_label: string;
  row_label: string;
  seat_label: string;
  is_blocked: boolean;
  x: number;
  y: number;
  is_accessible: boolean;
  status: SeatStatus;
  paid_activation_required: boolean;
}

export interface SeatPage {
  availability_version: number;
  items: EventSeat[];
  limit: number;
  offset: number;
}

export type DeliveryStatus = "none" | "queued" | "sending" | "delivered" | "failed" | string;

export interface TicketDelivery {
  ticket_id: string;
  ticket_status: TicketStatus;
  recipient_email: string;
  status: DeliveryStatus;
  attempt_count: number;
  last_error: string | null;
  last_delivered_at: string | null;
  resend_count: number;
  can_resend: boolean;
  next_resend_at: string | null;
}

export interface TicketAdmission {
  ticket_id: string;
  status: TicketStatus;
  checked_in_at: string | null;
  reversed_at: string | null;
  admission_window: { opens_at: string; closes_at: string };
}

export interface EntryConfirmation {
  id: string;
  ticket_id: string;
  event_id: string;
  token: string;
  code: string;
  issued_at: string;
  expires_at: string;
  expires_in_seconds: number;
  signing_key_id: string;
}
