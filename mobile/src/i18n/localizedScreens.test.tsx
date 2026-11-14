import { act, render, screen } from "@testing-library/react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";

import { getEventFinance, listPayouts } from "@/api/finance";
import type { Locale } from "@/api/types";
import type { EventFinance } from "@/api/types/finance";
import { CheckoutPanel } from "@/features/checkout/CheckoutPanel";
import { sampleEvent, sampleTicket } from "@/features/checkout/testing/fixtures";
import { FinanceTab } from "@/features/organizer/event/FinanceTab";
import { makeEvent } from "@/features/organizer/testFixtures";
import { describeOutcome } from "@/features/scanner/outcomes";
import { setLocale, t } from "@/i18n";

jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: jest.fn() }) }));
jest.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", profile: { id: "u1", email: "aru@example.com", display_name: "Aru Nurlan", email_verified_at: "2026-01-01T00:00:00Z" } }),
}));
jest.mock("@/api/finance");
jest.mock("@/api/promo");

// Words that may stay Latin: data from the fixtures, product and file names,
// and terms the web's own Kazakh and Russian catalogs keep in Latin script.
const ALLOWED = new Set(["almaty", "jazz", "night", "general", "aru", "nurlan", "biletflow", "kzt", "qr", "pdf", "svg", "png", "jpeg", "csv", "email", "example", "com"]);

function englishWords(texts: string[]): string[] {
  return texts.flatMap((text) => text.match(/[A-Za-z]{3,}/g) ?? []).filter((word) => !ALLOWED.has(word.toLowerCase()));
}

// Every visible string, plus labels a screen reader announces.
function renderedText(node: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(renderedText);
  const props = ["accessibilityLabel", "placeholder"].map((name) => node.props[name]).filter((value): value is string => typeof value === "string");
  const children = (node.children ?? []).flatMap((child) => (typeof child === "string" ? [child] : renderedText(child)));
  return [...props, ...children];
}

const finance = {
  event_id: "event-1",
  currency: "KZT",
  gross_minor: 1200000,
  discount_minor: 0,
  collected_minor: 1200000,
  fees_minor: 36000,
  refunds_minor: 0,
  pending_refunds_minor: 0,
  activation_charges_minor: 500000,
  activation_refunds_minor: 0,
  pending_activation_refunds_minor: 0,
  net_minor: 664000,
  reserved_minor: 0,
  sent_minor: 0,
  estimated_payout_minor: 664000,
  payout_eligible_at: "2026-12-01T21:00:00Z",
  generated_at: "2026-11-14T10:00:00Z",
} as EventFinance;

describe.each<Locale>(["ru", "kk"])("the app in %s", (locale) => {
  beforeEach(() => {
    jest.mocked(getEventFinance).mockResolvedValue(finance);
    jest.mocked(listPayouts).mockResolvedValue([]);
    setLocale(locale);
  });
  afterEach(() => setLocale("en"));

  it("shows checkout with no English left", async () => {
    await render(<CheckoutPanel event={sampleEvent} tickets={[sampleTicket()]} />);
    // The screen really rendered, in this language.
    expect(screen.getByText(t("checkout.reserve_tickets"))).toBeTruthy();
    expect(t("checkout.reserve_tickets")).not.toBe("Reserve tickets");
    expect(englishWords(renderedText(screen.toJSON()))).toEqual([]);
  });

  it("shows finance and payouts with no English left", async () => {
    await render(<FinanceTab event={makeEvent()} />);
    await screen.findByText(t("mobile.org.available_to_pay"));
    expect(englishWords(renderedText(screen.toJSON()))).toEqual([]);
  });

  it("translates every scanner result", () => {
    const codes = [
      "sign_in_required", "confirmation_expired", "confirmation_used", "invalid_confirmation", "offline_code_unavailable",
      "ticket_unclaimed", "wrong_event", "admission_not_open", "admission_closed", "ticket_not_found", "not_a_ticket_qr",
      "event_not_found", "permission_denied", "operation_conflict", "offline_unknown_ticket", "already_checked_in", "ticket_not_valid",
      "something_unexpected",
    ];
    const views = [
      ...codes.map((code) => describeOutcome({ kind: "rejected", code, checkedInAt: "2026-11-14T10:00:00Z", ticketStatus: "refunded" }, "Asia/Almaty")),
      describeOutcome({ kind: "network" }, "Asia/Almaty"),
    ];
    expect(views.every((view) => view.title && view.lines.every(Boolean))).toBe(true);
    expect(englishWords(views.flatMap((view) => [view.title, ...view.lines]))).toEqual([]);
  });

  it("switches back to English without a restart", async () => {
    await render(<FinanceTab event={makeEvent()} />);
    await screen.findByText(t("mobile.org.available_to_pay"));
    await act(async () => setLocale("en"));
    expect(await screen.findByText("Available to pay out")).toBeTruthy();
  });
});

it("finds English when the screen is in English, so the checks above can fail", async () => {
  await render(<CheckoutPanel event={sampleEvent} tickets={[sampleTicket()]} />);
  expect(englishWords(renderedText(screen.toJSON())).length).toBeGreaterThan(3);
});
