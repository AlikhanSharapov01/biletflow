import { deflateSync } from "node:zlib";
import type { Page, Route } from "@playwright/test";
import type { AdminMe } from "../../web/src/api/types/admin";
import type { CalendarLinks } from "../../web/src/api/types/calendar";
import {
  ACCESS_TOKEN,
  COVER_SIZES,
  UNREAD_NOTIFICATIONS,
  USER_ID,
  MANY_EVENTS_CATEGORY,
  categories,
  events,
  manyEvents,
  hold,
  NOW,
  organization,
  profile,
  publicSettings,
  ticketTypes,
  venues,
  type CoverKind,
  type Locale,
} from "./fixtures";

export type Role = "visitor" | "member" | "admin";

// A handler returns the JSON body, or undefined when the id is not a fixture.
type Handler = (url: URL, ids: string[]) => unknown;
type Reply = Handler | { status: number; body: unknown };
type Rule = { method: string; pattern: RegExp; reply: Reply };

const API = "/api/v1";
const ID = "([^/]+)";

// Solid-colour PNG of the given size, so cover images need no files on disk.
function solidPng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.alloc(1 + width * 3, 0x9a);
  row[0] = 0;
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function rules(role: Role, locale: Locale): Rule[] {
  const get = (path: string, reply: Handler): Rule => ({ method: "GET", pattern: new RegExp(`^${API}${path}$`), reply });
  const eventById = (eventId: string | undefined) => events.find((event) => event.id === eventId);
  const table: Rule[] = [
    // Anonymous visitors have no refresh cookie.
    {
      method: "POST",
      pattern: new RegExp(`^${API}/auth/refresh$`),
      reply: role !== "visitor" ? () => ({ access_token: ACCESS_TOKEN, token_type: "bearer", expires_in: 900, refresh_token: null }) : { status: 401, body: { detail: { code: "invalid_token" } } },
    },
    get("/categories", () => categories),
    get("/venues", () => venues),
    get("/events", (url) => {
      const param = (name: string) => url.searchParams.get(name);
      const q = param("q")?.toLowerCase();
      const city = param("city")?.toLowerCase();
      const cityOf = (venueId: string) => venues.find((venue) => venue.id === venueId)?.city.toLowerCase();
      // Date and price filters are not evaluated: the fixtures carry no prices.
      const matching = events.filter(
        (event) =>
          (!q || event.title.toLowerCase().includes(q)) &&
          (!param("category_id") || event.category_id === param("category_id")) &&
          (!city || cityOf(event.venue_id) === city),
      );
      // One category has more events than a page, so "Load more" has something to load.
      const list = param("category_id") === MANY_EVENTS_CATEGORY ? manyEvents() : matching;
      const offset = Number(param("offset") ?? 0);
      return list.slice(offset, offset + Number(param("limit") ?? 50));
    }),
    get(`/events/${ID}`, (_url, [eventId]) => eventById(eventId)),
    get(`/events/${ID}/ticket-types`, (_url, [eventId]) => (eventById(eventId) ? ticketTypes(eventId!) : undefined)),
    get(`/events/${ID}/images/${ID}`, (_url, [eventId, kind]) => (eventById(eventId) && kind! in COVER_SIZES ? { cover: kind } : undefined)),
    get("/settings/public", () => publicSettings),
  ];
  if (role !== "visitor") {
    table.push(
      { method: "POST", pattern: new RegExp(`^${API}/events/${ID}/holds$`), reply: (_url, [eventId]) => eventById(eventId) && hold(eventId!) },
      get("/me", () => profile(locale)),
      role === "admin"
        ? get("/admin/me", () => ({ user_id: USER_ID, is_platform_admin: true }) satisfies AdminMe)
        : { method: "GET", pattern: new RegExp(`^${API}/admin/me$`), reply: { status: 403, body: { detail: { code: "admin_required" } } } },
      get("/notifications/unread-count", () => ({ unread: UNREAD_NOTIFICATIONS })),
      get("/notifications", () => []),
      get("/organizations", () => [organization]),
      get(`/organizations/${ID}/members`, () => []),
      get(`/organizations/${ID}/invitations`, () => []),
      get(`/events/${ID}/check-ins`, (url, [eventId]) =>
        eventById(eventId) && {
          items: [
            {
              check_in_id: "layout-check-in-1",
              ticket_id: "layout-ticket-1",
              attendee_name: "Айгерим Сәрсенбекқызы-Нұрмұхамбетова",
              ticket_type_name: "Бүкіл күнге арналған VIP билеті",
              seat: { section_label: "A", row_label: "12", seat_label: "7" },
              source: "online",
              accepted_at: new Date(NOW.getTime() - 3_600_000).toISOString(),
              captured_at: null,
              scanner: { id: "layout-scanner", display_name: "Gate scanner" },
              device_label: null,
              operation_id: null,
              reversed_at: null,
              reversal: null,
            },
          ],
          total: 1,
          limit: Number(url.searchParams.get("limit")) || 50,
          offset: 0,
        },
      ),
      get(`/events/${ID}/staff`, (_url, [eventId]) => (eventById(eventId) ? [] : undefined)),
      get(`/events/${ID}/finance`, (_url, [eventId]) =>
        eventById(eventId) && {
          event_id: eventId, currency: "KZT", simulated: true, simulation_only: true, environments: ["simulation"],
          gross_minor: 1_200_000, discount_minor: 0, collected_minor: 1_200_000, fulfilled_collected_minor: 1_200_000,
          charged_fees_minor: 36_000, fee_reversals_minor: 0, fees_minor: 36_000, refunds_minor: 0, pending_refunds_minor: 0,
          activation_charges_minor: 500_000, activation_refunds_minor: 0, pending_activation_refunds_minor: 0,
          net_minor: 664_000, balance_minor: 664_000, reserved_minor: 0, sent_minor: 0, estimated_payout_minor: 664_000,
          payout_eligible_at: NOW.toISOString(), generated_at: NOW.toISOString(),
        },
      ),
      get(`/events/${ID}/finance/payouts`, (_url, [eventId]) => (eventById(eventId) ? [] : undefined)),
      get(`/events/${ID}/sync-conflicts`, (_url, [eventId]) => (eventById(eventId) ? [] : undefined)),
      get(`/events/${ID}/calendar-links`, (url, [eventId]) =>
        eventById(eventId) && ({
          google: "https://calendar.google.com/",
          outlook: "https://outlook.live.com/",
          office365: "https://outlook.office.com/",
          ics_path: url.pathname.replace("calendar-links", "calendar.ics"),
          ics_requires_sign_in: false,
          calendar_sequence: 0,
        } satisfies CalendarLinks),
      ),
    );
  }
  return table;
}

export interface MockedApi {
  /** Requests the page made that no fixture answers; tests assert this is empty. */
  unmocked: string[];
}

/**
 * Answers every `/api/**` and `/health` request in the browser. A request without a
 * fixture is logged, recorded in `unmocked` and answered (501, or 404 for an unknown id)
 * so the page fails fast.
 */
export async function mockApi(page: Page, role: Role, locale: Locale): Promise<MockedApi> {
  const table = rules(role, locale);
  const state: MockedApi = { unmocked: [] };
  const covers = Object.fromEntries(
    (Object.keys(COVER_SIZES) as CoverKind[]).map((kind) => [kind, solidPng(COVER_SIZES[kind].width, COVER_SIZES[kind].height)]),
  );

  const missing = (route: Route, status: number, code: string) => {
    const request = route.request();
    const label = `${request.method()} ${new URL(request.url()).pathname}${new URL(request.url()).search}`;
    console.error(`[layout] no fixture for ${label}`);
    state.unmocked.push(label);
    return route.fulfill({ status, json: { detail: { code } } });
  };

  const handle = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/health") return route.fulfill({ json: { status: "ok" } });
    for (const rule of table) {
      const match = rule.method === request.method() ? rule.pattern.exec(url.pathname) : null;
      if (!match) continue;
      if (typeof rule.reply !== "function") return route.fulfill({ status: rule.reply.status, json: rule.reply.body });
      const body = rule.reply(url, match.slice(1).map(decodeURIComponent));
      if (body === undefined) return missing(route, 404, "layout_fixture_not_found");
      const image = (body as { cover?: CoverKind }).cover;
      if (image) return route.fulfill({ contentType: "image/png", body: covers[image] });
      return route.fulfill({ json: body });
    }
    return missing(route, 501, "layout_fixture_missing");
  };

  // A predicate, because the dev server also serves modules under /src/api/.
  await page.route((url) => url.pathname.startsWith("/api/") || url.pathname === "/health", handle);
  return state;
}
