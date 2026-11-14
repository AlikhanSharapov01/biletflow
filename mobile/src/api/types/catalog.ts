// Mirrors backend/app/catalog_schemas.py: categories, venues, events,
// ticket types and the event activity history.

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
  // Ordered gallery; the first image is the cover.
  images?: EventImage[];
  cover_image_url?: string | null;
}

export interface EventImage {
  id: string;
  url: string;
  alt_text: string;
  sort_order: number;
  is_cover: boolean;
  mime_type: string;
  size_bytes: number;
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
