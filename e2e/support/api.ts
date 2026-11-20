// Small API client for test set-up and for the checks that do not need a browser.
// Every call states the status it expects, so a broken set-up fails with the response body.

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
export const MAIL_URL = process.env.E2E_MAIL_URL ?? "http://localhost:8025";
export const PASSWORD = "correct horse battery staple";

const API = `${BASE_URL}/api/v1`;
const runId = Math.random().toString(16).slice(2, 10);
let counter = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; expect?: number | number[] } = {},
): Promise<Json> {
  const expected = [options.expect ?? 200].flat();
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path} -> ${response.status} (wanted ${expected.join("/")}): ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function until<T>(label: string, check: () => Promise<T | null | undefined | false>, seconds = 30): Promise<T> {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function mailToken(email: string, marker: string): Promise<string> {
  return until(`an email to ${email} containing ${marker}`, async () => {
    const found = await fetch(`${MAIL_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const messages: Array<{ ID: string }> = (await found.json()).messages ?? [];
    for (const message of messages) {
      const body = await (await fetch(`${MAIL_URL}/api/v1/message/${message.ID}`)).json();
      const hit = new RegExp(`${marker}#token=([^\\s]+)`).exec(body.Text ?? "");
      if (hit) return hit[1];
    }
    return null;
  });
}

export interface Account {
  name: string;
  email: string;
  password: string;
  /** Web session token, for API calls made as this person. */
  token: string;
}

export async function login(email: string, kind: "web" | "scanner" = "web"): Promise<string> {
  const session = await call("POST", "/auth/login", {
    body: { email, password: PASSWORD, client_kind: kind },
  });
  return session.access_token;
}

/** A registered, e-mail-verified account (verification link read from Mailpit). */
export async function createAccount(name: string): Promise<Account> {
  const email = `${name.toLowerCase().replace(/\W+/g, "-")}-${runId}-${++counter}@example.com`;
  await call("POST", "/auth/register", {
    // New accounts default to Russian and the app follows the account's language,
    // so ask for English to keep the texts the tests look for stable.
    body: { email, password: PASSWORD, display_name: name, locale: "en" },
    expect: 202,
  });
  await call("POST", "/auth/verify-email", { body: { token: await mailToken(email, "verify-email") } });
  return { name, email, password: PASSWORD, token: await login(email) };
}

// Offsets from one fixed instant, so related times (ticket sales end exactly when
// registration closes) never drift apart by a few milliseconds.
const startedAt = Date.now();
const hours = (n: number) => new Date(startedAt + n * 3_600_000).toISOString();

export interface Organizer {
  account: Account;
  orgId: string;
  event: Json;
  ticketTypes: Record<string, Json>;
}

export interface TicketSpec {
  key: string;
  name: string;
  kind: "free" | "paid";
  priceMinor: number;
}

/** An organizer with a published event that is open for registration right now. */
export async function createPublishedEvent(title: string, tickets: TicketSpec[]): Promise<Organizer> {
  const account = await createAccount("Organizer");
  const org = await call("POST", "/organizations", {
    token: account.token,
    body: { name: `E2E Org ${runId}`, contact_email: "org@example.com" },
    expect: 201,
  });
  const [category] = await call("GET", "/categories");
  const [venue] = await call("GET", "/venues");
  const event = await call("POST", `/organizations/${org.id}/events`, {
    token: account.token,
    expect: 201,
    body: {
      category_id: category.id,
      venue_id: venue.id,
      title: `${title} ${runId}`,
      capacity: 50,
      starts_at: hours(1),
      ends_at: hours(4),
      registration_opens_at: hours(-1),
      registration_closes_at: hours(1),
      admission_opens_at: new Date(startedAt - 600_000).toISOString(),
      admission_closes_at: hours(3),
      refund_cutoff_at: new Date(startedAt + 1_800_000).toISOString(),
    },
  });
  const ticketTypes: Record<string, Json> = {};
  for (const spec of tickets) {
    ticketTypes[spec.key] = await call("POST", `/events/${event.id}/ticket-types`, {
      token: account.token,
      expect: 201,
      body: {
        name: spec.name,
        kind: spec.kind,
        price_minor: spec.priceMinor,
        quantity_limit: 50,
        per_order_limit: 4,
        sales_open_at: hours(-1),
        sales_close_at: hours(1),
      },
    });
  }
  await call("POST", `/events/${event.id}/publish`, { token: account.token });
  return { account, orgId: org.id, event, ticketTypes };
}

/** Simulated paid-sales activation (checklist, then the activation fee through the simulator). */
export async function activatePaidSales(organizer: Organizer): Promise<void> {
  const { token } = organizer.account;
  const eventId = organizer.event.id;
  for (const step of ["payout-profile", "identity-verification"]) {
    await call("POST", `/organizations/${organizer.orgId}/paid-sales/${step}`, { token });
  }
  const checklist = await call("GET", `/events/${eventId}/paid-sales`, { token });
  await call("POST", `/events/${eventId}/paid-sales/terms`, {
    token,
    body: { terms_version: checklist.terms.version },
  });
  const started = await call("POST", `/events/${eventId}/paid-sales/activation`, { token });
  await until("the activation payment to be ready", async () => {
    const view = await call("GET", `/events/${eventId}/paid-sales`, { token });
    return view.payment?.status === "pending";
  });
  await call("POST", `/simulator/payments/${started.payment.id}/events`, {
    token,
    body: { outcome: "succeeded" },
  });
  const done = await call("GET", `/events/${eventId}/paid-sales`, { token });
  if (done.status !== "active") throw new Error(`paid sales not active: ${done.status}`);
}

export async function createCampaign(organizer: Organizer, code: string, percent: number): Promise<Json> {
  return call("POST", `/events/${organizer.event.id}/campaigns`, {
    token: organizer.account.token,
    expect: 201,
    body: {
      name: `E2E ${code}`,
      discount_kind: "percent",
      value: percent,
      starts_at: hours(-1),
      ends_at: hours(1),
      max_redemptions: 10,
      eligible_ticket_type_ids: [],
      code,
    },
  });
}

export interface PlacedOrder {
  order: Json;
  buyer: Account;
}

/** A paid order bought through the API and paid through the simulator. */
export async function buyPaidTicket(organizer: Organizer, ticketKey: string, buyer?: Account): Promise<PlacedOrder> {
  const account = buyer ?? (await createAccount("Buyer"));
  const hold = await call("POST", `/events/${organizer.event.id}/holds`, {
    token: account.token,
    expect: 201,
    body: { items: [{ ticket_type_id: organizer.ticketTypes[ticketKey].id, quantity: 1 }] },
  });
  const order = await call("POST", `/holds/${hold.id}/checkout`, {
    token: account.token,
    body: {
      recipients: [{ allocation_id: hold.allocations[0].id, name: account.name, email: account.email }],
    },
  });
  await call("POST", `/simulator/payments/${order.payment.id}/events`, {
    token: account.token,
    body: { outcome: "succeeded" },
  });
  const confirmed = await call("GET", `/orders/${order.id}`, { token: account.token });
  return { order: confirmed, buyer: account };
}

/** A free registration made through the API. */
export async function registerFree(organizer: Organizer, ticketKey: string, buyer: Account): Promise<Json> {
  const hold = await call("POST", `/events/${organizer.event.id}/holds`, {
    token: buyer.token,
    expect: 201,
    body: { items: [{ ticket_type_id: organizer.ticketTypes[ticketKey].id, quantity: 1 }] },
  });
  return call("POST", `/holds/${hold.id}/confirm`, {
    token: buyer.token,
    body: {
      recipients: [{ allocation_id: hold.allocations[0].id, name: buyer.name, email: buyer.email }],
    },
  });
}

/** Admission at the door: the organizer scans with the scanner app's API. */
export async function scan(organizer: Organizer, qrPayload: string, entryConfirmation?: string) {
  const token = await login(organizer.account.email, "scanner");
  return fetch(`${API}/scanner/events/${organizer.event.id}/check-ins`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      qr_payload: qrPayload,
      ...(entryConfirmation ? { entry_confirmation: entryConfirmation } : {}),
    }),
  });
}

/** The attendee's short-lived proof that they are at the door (BF-10). */
export async function entryConfirmation(buyer: Account, ticketId: string): Promise<string> {
  const proof = await call("POST", `/tickets/${ticketId}/entry-confirmations`, {
    token: buyer.token,
    expect: 201,
  });
  return proof.token;
}
