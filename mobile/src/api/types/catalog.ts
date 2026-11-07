// Catalog wire types, mirroring backend/app/catalog_schemas.py.

export type Category = {
  id: string;
  code: string;
  name_kk: string;
  name_ru: string;
  name_en: string;
};

export type Venue = {
  id: string;
  name: string;
  address: string;
  city: string;
  country_code: string;
};

export type CatalogEvent = {
  id: string;
  organization_id: string;
  category_id: string;
  venue_id: string;
  title: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  capacity: number;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  publication_state: string;
  time_status: string;
};

export type TicketType = {
  id: string;
  event_id: string;
  name: string;
  description: string;
  kind: "free" | "paid";
  price_minor: number;
  is_hidden: boolean;
};

export type EventFilters = {
  q: string;
  categoryId: string;
};
