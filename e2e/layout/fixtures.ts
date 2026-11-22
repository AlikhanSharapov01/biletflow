// Fixtures for the layout checks. Shapes are typed against web/src/api/types, so an
// API change fails the typecheck instead of drifting. The content is chosen to break
// layouts: very long titles and venue names in every language, events with and
// without a cover image, zero and very large counts, and more events than fit on one
// row of the grid.
import type { Category, EventView, Profile, TicketType, Venue } from "../../web/src/api/types";
import type { PublicSettings } from "../../web/src/api/types/settings";
import type { Organization } from "../../web/src/api/types/organizations";

export type Locale = "en" | "ru" | "kk";
export const LOCALES: readonly Locale[] = ["en", "ru", "kk"];

// The browser clock is pinned here (see openPage in layout.spec.ts); every date below
// is relative to it, so the pages look the same on any calendar day.
export const NOW = new Date("2027-01-15T06:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number, hour = 0) => new Date(NOW.getTime() + days * DAY + hour * 60 * 60 * 1000).toISOString();

const CREATED = at(-90);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const USER_ID = uuid(1);
export const ORGANIZATION_ID = uuid(2);

export const categories = [
  { id: uuid(10), code: "conference", name_en: "Conferences and professional forums", name_ru: "Конференции и профессиональные форумы", name_kk: "Конференциялар мен кәсіби форумдар" },
  { id: uuid(11), code: "music", name_en: "Music", name_ru: "Музыка", name_kk: "Музыка" },
  { id: uuid(12), code: "sport", name_en: "Sport", name_ru: "Спорт", name_kk: "Спорт" },
].map((category) => ({ ...category, created_at: CREATED })) satisfies Category[];

export const venues = [
  {
    id: uuid(20),
    name: "Republican Palace of Culture and Arts named after the First President of the Republic",
    address: "Abylai Khan Avenue 123, building 4, entrance C",
    city: "Temirtau, Karaganda Region, Republic of Kazakhstan",
    country_code: "KZ",
  },
  { id: uuid(21), name: "Qazaqstan Arena", address: "Dostyk 5", city: "Almaty", country_code: "KZ" },
].map((venue) => ({ ...venue, created_at: CREATED })) satisfies Venue[];

// Titles of 90+ characters, one per language, to find truncation and overflow.
const LONG_TITLE = {
  en: "International Scientific and Practical Conference on Sustainable Development of Urban Infrastructure and Digital Transformation",
  ru: "Международная научно-практическая конференция по вопросам устойчивого развития городской инфраструктуры и цифровой трансформации",
  kk: "Қалалық инфрақұрылымның тұрақты дамуы және цифрлық трансформация мәселелері жөніндегі халықаралық ғылыми-практикалық конференция",
} as const;

// Cover images are served by the mocked API (see mockApi.ts): a wide and a tall one.
export const COVER_SIZES = { wide: { width: 1600, height: 400 }, tall: { width: 400, height: 1600 } } as const;
export type CoverKind = keyof typeof COVER_SIZES;

function cover(eventId: string, kind: CoverKind) {
  const url = `/api/v1/events/${eventId}/images/${kind}`;
  return {
    images: [{ id: uuid(kind === "wide" ? 300 : 301), url, alt_text: `Cover (${kind})`, sort_order: 0, is_cover: true, mime_type: "image/png", size_bytes: 1000 }],
    cover_image_url: url,
  };
}

function eventView(n: number, title: string, overrides: Partial<EventView> = {}): EventView {
  const start = 20 + n; // days after NOW
  return {
    id: uuid(100 + n),
    created_at: CREATED,
    updated_at: CREATED,
    organization_id: ORGANIZATION_ID,
    category_id: categories[n % categories.length]!.id,
    venue_id: venues[n % 2 === 0 ? 0 : 1]!.id,
    venue_layout_id: null,
    title,
    description: "A long description. ".repeat(40),
    visibility: "public",
    seating_mode: "general",
    capacity: 500,
    starts_at: at(start, 14),
    ends_at: at(start, 18),
    time_zone: "Asia/Almaty",
    registration_opens_at: at(-30),
    registration_closes_at: at(start, 12),
    admission_opens_at: at(start, 13),
    admission_closes_at: at(start, 18),
    refund_allowed: true,
    refund_cutoff_at: at(start - 1),
    publication_state: "published",
    moderation_state: "normal",
    calendar_uid: `event-${n}@biletflow`,
    calendar_sequence: 0,
    availability_version: 1,
    time_status: "upcoming",
    images: [],
    cover_image_url: null,
    ...overrides,
  };
}

// Ten events: the first three open on the event pages and have no cover image;
// "Short" has a wide cover and "Almaty Jazz Night" a tall one.
const id = (n: number) => uuid(100 + n);
export const events: EventView[] = [
  eventView(0, LONG_TITLE.en, { capacity: 1_000_000 }),
  eventView(1, LONG_TITLE.ru, { capacity: 0 }),
  eventView(2, LONG_TITLE.kk, { capacity: 2_147_483_647 }),
  eventView(3, "Short", cover(id(3), "wide")),
  eventView(4, "Almaty Jazz Night", cover(id(4), "tall")),
  eventView(5, "Весенний марафон «Алматы»", { time_status: "completed", starts_at: at(-5, 14), ends_at: at(-5, 18) }),
  eventView(6, "Көктемгі кітап жәрмеңкесі"),
  eventView(7, "A_very_long_unbroken_title_" + "without_any_spaces_".repeat(6)),
  eventView(8, "Tech Summit 2027"),
  eventView(9, "Фестиваль уличной еды и музыки под открытым небом"),
];

// The event each locale opens on the event pages: its own long title.
export const FOCUS_EVENT: Record<Locale, string> = {
  en: events[0]!.id,
  ru: events[1]!.id,
  kk: events[2]!.id,
};

// One type with no tickets left to sell (limit 0), one free and one very expensive
// type that can be bought today, so the purchase controls render.
export function ticketTypes(eventId: string): TicketType[] {
  const base = {
    created_at: CREATED,
    event_id: eventId,
    description: "",
    sales_open_at: at(-10),
    sales_close_at: at(25),
    is_hidden: false,
  };
  return [
    { ...base, id: uuid(200), name: "Sold out", kind: "free", price_minor: 0, quantity_limit: 0, per_order_limit: 4 },
    { ...base, id: uuid(202), name: "Free admission", kind: "free", price_minor: 0, quantity_limit: 100, per_order_limit: 4 },
    {
      ...base,
      id: uuid(201),
      name: "Премиальный пакет участника с участием в закрытой части программы и банкетом",
      kind: "paid",
      price_minor: 99_999_999_900,
      quantity_limit: 1_000_000,
      per_order_limit: 10,
    },
  ];
}

export const profile = (locale: Locale): Profile => ({
  id: USER_ID,
  email: "very.long.address.for.layout.checks@example-organisation-with-a-long-name.kz",
  display_name: "Нұрланбекқызы Айгерім Серікбайқызы-Әлібекова",
  locale,
  email_verified_at: CREATED,
  analytics_consent: false,
});

export const organization: Organization = {
  id: ORGANIZATION_ID,
  created_at: CREATED,
  owner_user_id: USER_ID,
  name: "Қазақстан халықаралық мәдени және іскерлік оқиғалар ұйымдастырушылар қауымдастығы",
  contact_email: "contact@example-organisation-with-a-long-name.kz",
  contact_phone: null,
  status: "active",
};

export const publicSettings: PublicSettings = {
  hold_minutes: 10,
  processing_rate_bps: 250,
  activation_fee_minor: 0,
  upload_max_bytes: 5_000_000,
  currency: "KZT",
};

// A large unread count makes the notification badge as wide as it can get.
export const UNREAD_NOTIFICATIONS = 12_345;
export const ACCESS_TOKEN = "layout-check-token";
