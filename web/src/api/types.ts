// Response and request shapes mirrored from backend/app/schemas.py,
// backend/app/catalog_schemas.py and backend/app/checkout_schemas.py.
// Dates are ISO-8601 strings; ids are UUIDs; money is KZT minor units (tiyn).

export type Locale = "kk" | "ru" | "en";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  locale: Locale;
  email_verified_at: string | null;
  analytics_consent: boolean;
}

export interface ProfileUpdate {
  display_name?: string;
  locale?: Locale;
  analytics_consent?: boolean;
}

export interface SessionView {
  id: string;
  client_kind: "web" | "scanner";
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
}

export interface TokenPair {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string | null;
}

export interface AuthorizationURL {
  authorization_url: string;
}

export interface Message {
  code: string;
}

// ---------------------------------------------------------------- catalogue

export interface Category {
  id: string;
  created_at: string;
  code: string;
  name_kk: string;
  name_ru: string;
  name_en: string;
}

export interface Venue {
  id: string;
  created_at: string;
  name: string;
  address: string;
  city: string;
  country_code: string;
}

export interface Organization {
  id: string;
  created_at: string;
  owner_user_id: string;
  name: string;
  contact_email: string;
  contact_phone: string | null;
  status: string;
}

export interface OrganizationCreate {
  name: string;
  contact_email: string;
  contact_phone: string | null;
}

export type OrgCapability = "manage_profile" | "manage_staff" | "finance";
export type EventCapability =
  | "event_edit"
  | "attendees"
  | "support"
  | "reports"
  | "refund"
  | "scan"
  | "reverse_checkin"
  | "staff";

export const EVENT_CAPABILITIES: Array<{ id: EventCapability; label: string; hint: string }> = [
  { id: "event_edit", label: "Edit event", hint: "Change details, tickets and publication" },
  { id: "attendees", label: "Attendees", hint: "See the attendee list" },
  { id: "staff", label: "Staff", hint: "Assign other staff to this event" },
  { id: "reports", label: "Reports", hint: "Read the activity history" },
  { id: "scan", label: "Scan tickets", hint: "Check attendees in with the mobile app" },
  { id: "reverse_checkin", label: "Undo check-ins", hint: "Reverse an accidental admission" },
  { id: "support", label: "Support", hint: "Reserved for the support module" },
  { id: "refund", label: "Refunds", hint: "Reserved for the refund module" },
];

export interface MemberDetail {
  id: string;
  created_at: string;
  organization_id: string;
  user_id: string;
  status: string;
  revoked_at: string | null;
  display_name: string;
  email: string;
  capabilities: OrgCapability[];
}

export interface Invitation {
  id: string;
  created_at: string;
  organization_id: string;
  email: string;
  invited_by_user_id: string;
  expires_at: string;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
}

export interface StaffAssignment {
  id: string;
  created_at: string;
  event_id: string;
  organization_id: string;
  member_id: string;
  revoked_at: string | null;
  capabilities: EventCapability[];
}

export type Visibility = "public" | "unlisted" | "private";
export type SeatingMode = "general" | "assigned";
export type PublicationState = "draft" | "published" | "unpublished" | "cancelled";
export type TimeStatus = "upcoming" | "active" | "completed";

export interface EventInput {
  category_id: string;
  venue_id: string;
  venue_layout_id?: string | null;
  title: string;
  description: string;
  visibility: Visibility;
  seating_mode: SeatingMode;
  capacity: number;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  registration_opens_at: string;
  registration_closes_at: string;
  admission_opens_at: string;
  admission_closes_at: string;
  refund_allowed: boolean;
  refund_cutoff_at: string | null;
}

export interface EventView extends EventInput {
  id: string;
  created_at: string;
  organization_id: string;
  publication_state: PublicationState;
  moderation_state: "normal" | "suspended";
  calendar_uid: string;
  calendar_sequence: number;
  availability_version: number;
  updated_at: string;
  time_status: TimeStatus;
}

export interface EventFilters {
  q?: string;
  category_id?: string;
  limit?: number;
}

export interface TicketTypeInput {
  name: string;
  description: string;
  kind: "free" | "paid";
  price_minor: number;
  quantity_limit: number;
  per_order_limit: number;
  sales_open_at: string;
  sales_close_at: string;
  is_hidden: boolean;
}

export interface TicketType extends TicketTypeInput {
  id: string;
  created_at: string;
  event_id: string;
}

export interface HistoryEntry {
  id: string;
  created_at: string;
  event_id: string | null;
  organization_id: string | null;
  actor_user_id: string | null;
  service_actor: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  description: string;
  safe_change: Record<string, unknown>;
  correlation_id: string;
}

// ----------------------------------------------------------------- checkout

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

export interface Order {
  id: string;
  event_id: string;
  buyer_user_id: string;
  hold_id: string;
  status: "confirmed" | string;
  currency: string;
  gross_minor: number;
  discount_minor: number;
  payable_minor: number;
  processing_fee_minor: number;
  confirmed_at: string | null;
  created_at: string;
  items: OrderItem[];
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
