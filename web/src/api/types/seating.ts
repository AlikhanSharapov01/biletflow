// Mirrors the seat and layout views in backend/app/catalog_schemas.py.

export interface VenueLayout {
  id: string;
  created_at: string;
  venue_id: string;
  name: string;
  version: number;
  canvas_width: number;
  canvas_height: number;
}

export interface PhysicalSeat {
  id: string;
  created_at: string;
  layout_id: string;
  row_id: string;
  label: string;
  price_category: string;
  is_accessible: boolean;
  x: number;
  y: number;
  row_label: string;
  section_label: string;
}

export interface VenueLayoutDetail extends VenueLayout {
  seats: PhysicalSeat[];
}

export type SeatStatus = "available" | "unavailable" | "blocked" | "held" | "sold" | "refund_pending";

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
}

export interface SeatAvailability extends EventSeat {
  x: number;
  y: number;
  is_accessible: boolean;
  status: SeatStatus;
  paid_activation_required: boolean;
}

export interface SeatPage {
  availability_version: number;
  items: SeatAvailability[];
  limit: number;
  offset: number;
}

export interface SeatUpdate {
  is_blocked: boolean;
  ticket_type_id?: string | null;
}
