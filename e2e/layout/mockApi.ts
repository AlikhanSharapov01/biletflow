import type { Page, Route } from "@playwright/test";
import {
  ACCESS_TOKEN,
  UNREAD_NOTIFICATIONS,
  USER_ID,
  categories,
  events,
  organization,
  profile,
  publicSettings,
  ticketTypes,
  venues,
  type Locale,
} from "./fixtures";

export type Role = "visitor" | "admin";

type Handler = (url: URL) => unknown;
type Rule = { method: string; pattern: RegExp; reply: Handler | { status: number; body: unknown } };

const API = "/api/v1";
const ID = "[^/]+";

function rules(role: Role, locale: Locale): Rule[] {
  const get = (path: string, reply: Handler): Rule => ({ method: "GET", pattern: new RegExp(`^${API}${path}$`), reply });
  const rule: Rule[] = [
    // Anonymous visitors have no refresh cookie.
    {
      method: "POST",
      pattern: new RegExp(`^${API}/auth/refresh$`),
      reply: role === "admin" ? () => ({ access_token: ACCESS_TOKEN, token_type: "bearer", expires_in: 900, refresh_token: null }) : { status: 401, body: { detail: { code: "invalid_token" } } },
    },
    get("/categories", () => categories),
    get("/venues", () => venues),
    get("/events", (url) => {
      const q = url.searchParams.get("q")?.toLowerCase();
      return events.filter((event) => !q || event.title.toLowerCase().includes(q));
    }),
    get(`/events/${ID}`, (url) => events.find((event) => url.pathname.endsWith(event.id)) ?? null),
    get(`/events/${ID}/ticket-types`, (url) => ticketTypes(url.pathname.split("/")[4] ?? "")),
    get("/settings/public", () => publicSettings),
  ];
  if (role === "admin") {
    rule.push(
      get("/me", () => profile(locale)),
      get("/admin/me", () => ({ user_id: USER_ID, is_platform_admin: true })),
      get("/notifications/unread-count", () => ({ unread: UNREAD_NOTIFICATIONS })),
      get("/notifications", () => []),
      get("/organizations", () => [organization]),
      get(`/organizations/${ID}/members`, () => []),
      get(`/organizations/${ID}/invitations`, () => []),
      get(`/events/${ID}/calendar-links`, (url) => ({
        google: "https://calendar.google.com/",
        outlook: "https://outlook.live.com/",
        office365: "https://outlook.office.com/",
        ics_path: `${url.pathname.replace("calendar-links", "calendar.ics")}`,
        ics_requires_sign_in: false,
        calendar_sequence: 0,
      })),
    );
  }
  return rule;
}

export interface MockedApi {
  /** URLs the page requested that no fixture answers; tests assert this is empty. */
  unmocked: string[];
}

/**
 * Answers every `/api/**` and `/health` request in the browser. A request without a
 * fixture is logged, recorded in `unmocked` and answered with 501 so the page fails fast.
 */
export async function mockApi(page: Page, role: Role, locale: Locale): Promise<MockedApi> {
  const table = rules(role, locale);
  const state: MockedApi = { unmocked: [] };

  const handle = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/health") return route.fulfill({ json: { status: "ok" } });
    const match = table.find((rule) => rule.method === request.method() && rule.pattern.test(url.pathname));
    if (!match) {
      const label = `${request.method()} ${url.pathname}${url.search}`;
      console.error(`[layout] no fixture for ${label}`);
      state.unmocked.push(label);
      return route.fulfill({ status: 501, json: { detail: { code: "layout_fixture_missing" } } });
    }
    if (typeof match.reply === "function") return route.fulfill({ json: match.reply(url) });
    return route.fulfill({ status: match.reply.status, json: match.reply.body });
  };

  // A predicate, because the dev server also serves modules under /src/api/.
  await page.route((url) => url.pathname.startsWith("/api/") || url.pathname === "/health", handle);
  return state;
}

