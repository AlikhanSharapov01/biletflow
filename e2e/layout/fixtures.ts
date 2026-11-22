// Fixtures for the layout checks. Shapes mirror web/src/api/types; the content is
// chosen to break layouts: very long titles and venue names in every language,
// an event without a cover image, zero and very large counts, and more events
// than fit on one row of the grid.

export type Locale = "en" | "ru" | "kk";
export const LOCALES: readonly Locale[] = ["en", "ru", "kk"];

const CREATED = "2026-01-01T00:00:00Z";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const USER_ID = uuid(1);
export const ORGANIZATION_ID = uuid(2);

export const categories = [
  { id: uuid(10), code: "conference", name_en: "Conferences and professional forums", name_ru: "Конференции и профессиональные форумы", name_kk: "Конференциялар мен кәсіби форумдар" },
  { id: uuid(11), code: "music", name_en: "Music", name_ru: "Музыка", name_kk: "Музыка" },
  { id: uuid(12), code: "sport", name_en: "Sport", name_ru: "Спорт", name_kk: "Спорт" },
].map((category) => ({ ...category, created_at: CREATED }));

export const venues = [
  {
    id: uuid(20),
    name: "Republican Palace of Culture and Arts named after the First President of the Republic",
    address: "Abylai Khan Avenue 123, building 4, entrance C",
    city: "Temirtau, Karaganda Region, Republic of Kazakhstan",
    country_code: "KZ",
  },
  { id: uuid(21), name: "Qazaqstan Arena", address: "Dostyk 5", city: "Almaty", country_code: "KZ" },
].map((venue) => ({ ...venue, created_at: CREATED }));

// Titles of 90+ characters, one per language, to find truncation and overflow.
const LONG_TITLE = {
  en: "International Scientific and Practical Conference on Sustainable Development of Urban Infrastructure and Digital Transformation",
  ru: "Международная научно-практическая конференция по вопросам устойчивого развития городской инфраструктуры и цифровой трансформации",
  kk: "Қалалық инфрақұрылымның тұрақты дамуы және цифрлық трансформация мәселелері жөніндегі халықаралық ғылыми-практикалық конференция",
} as const;

function eventView(n: number, title: string, overrides: Record<string, unknown> = {}) {
  const day = String(10 + n).padStart(2, "0");
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
    starts_at: `2027-03-${day}T14:00:00Z`,
    ends_at: `2027-03-${day}T18:00:00Z`,
    time_zone: "Asia/Almaty",
    registration_opens_at: "2026-12-01T00:00:00Z",
    registration_closes_at: `2027-03-${day}T12:00:00Z`,
    admission_opens_at: `2027-03-${day}T13:00:00Z`,
    admission_closes_at: `2027-03-${day}T18:00:00Z`,
    refund_allowed: true,
    refund_cutoff_at: `2027-03-${day}T00:00:00Z`,
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

// Ten events, none with a cover image, so every card shows the generated art.
export const events = [
  eventView(0, LONG_TITLE.en, { capacity: 1_000_000 }),
  eventView(1, LONG_TITLE.ru, { capacity: 0 }),
  eventView(2, LONG_TITLE.kk, { capacity: 2_147_483_647 }),
  eventView(3, "Short"),
  eventView(4, "Almaty Jazz Night"),
  eventView(5, "Весенний марафон «Алматы»", { time_status: "completed" }),
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

export function ticketTypes(eventId: string) {
  const base = {
    created_at: CREATED,
    event_id: eventId,
    description: "",
    sales_open_at: "2026-12-01T00:00:00Z",
    sales_close_at: "2027-03-10T00:00:00Z",
    is_hidden: false,
  };
  return [
    { ...base, id: uuid(200), name: "Free admission", kind: "free", price_minor: 0, quantity_limit: 0, per_order_limit: 4 },
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

export const profile = (locale: Locale) => ({
  id: USER_ID,
  email: "very.long.address.for.layout.checks@example-organisation-with-a-long-name.kz",
  display_name: "Нұрланбекқызы Айгерім Серікбайқызы-Әлібекова",
  locale,
  email_verified_at: CREATED,
  analytics_consent: false,
});

export const organization = {
  id: ORGANIZATION_ID,
  created_at: CREATED,
  owner_user_id: USER_ID,
  name: "Қазақстан халықаралық мәдени және іскерлік оқиғалар ұйымдастырушылар қауымдастығы",
  contact_email: "contact@example-organisation-with-a-long-name.kz",
  contact_phone: null,
  status: "active",
};

export const publicSettings = {
  hold_minutes: 10,
  processing_rate_bps: 250,
  activation_fee_minor: 0,
  upload_max_bytes: 5_000_000,
  currency: "KZT",
};

// A large unread count makes the notification badge as wide as it can get.
export const UNREAD_NOTIFICATIONS = 12_345;
export const ACCESS_TOKEN = "layout-check-token";
