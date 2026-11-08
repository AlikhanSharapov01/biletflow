import type { Category, EventView, Organization, Venue } from "@/api/types";

// Shared sample records for the organizer screen tests.
export const organization: Organization = {
  id: "org-1",
  created_at: "2026-01-01T00:00:00Z",
  owner_user_id: "u1",
  name: "Northline Collective",
  contact_email: "team@northline.kz",
  contact_phone: null,
  status: "active",
};

export const category: Category = { id: "cat-1", created_at: "", code: "music", name_kk: "Музыка", name_ru: "Музыка", name_en: "Music" };

export const venue: Venue = { id: "venue-1", created_at: "", name: "Kazakhconcert Hall", address: "Abay 1", city: "Almaty", country_code: "KZ" };

export function makeEvent(overrides: Partial<EventView> = {}): EventView {
  return {
    id: "event-1",
    created_at: "2026-10-01T00:00:00Z",
    organization_id: "org-1",
    category_id: "cat-1",
    venue_id: "venue-1",
    venue_layout_id: null,
    title: "Almaty Jazz Night",
    description: "Live jazz.",
    visibility: "public",
    seating_mode: "general",
    capacity: 100,
    starts_at: "2026-12-01T14:00:00Z",
    ends_at: "2026-12-01T17:00:00Z",
    time_zone: "Asia/Almaty",
    registration_opens_at: "2026-10-01T00:00:00Z",
    registration_closes_at: "2026-12-01T14:00:00Z",
    admission_opens_at: "2026-12-01T13:00:00Z",
    admission_closes_at: "2026-12-01T17:00:00Z",
    refund_allowed: false,
    refund_cutoff_at: null,
    publication_state: "draft",
    moderation_state: "normal",
    calendar_uid: "uid",
    calendar_sequence: 0,
    availability_version: 1,
    updated_at: "2026-10-01T00:00:00Z",
    time_status: "upcoming",
    ...overrides,
  };
}
