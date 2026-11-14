import type { TabItem } from "@/components/ui";
import { t } from "@/i18n";

export type EventTab =
  | "details"
  | "tickets"
  | "seating"
  | "paid-sales"
  | "attendees"
  | "check-ins"
  | "staff"
  | "campaigns"
  | "analytics"
  | "finance"
  | "history";

export const EVENT_TABS: TabItem<EventTab>[] = [
  { id: "details", get label() { return t("common.details"); } },
  { id: "tickets", get label() { return t("organizer.ticket_types"); } },
  { id: "seating", get label() { return t("organizer.seating"); } },
  { id: "paid-sales", get label() { return t("organizer.paid_sales"); } },
  { id: "attendees", get label() { return t("organizer.attendees"); } },
  { id: "check-ins", get label() { return t("organizer.check_ins"); } },
  { id: "staff", get label() { return t("organizer.staff"); } },
  { id: "campaigns", get label() { return t("organizer.campaigns"); } },
  { id: "analytics", get label() { return t("organizer.analytics"); } },
  { id: "finance", get label() { return t("organizer.finance"); } },
  { id: "history", get label() { return t("organizer.history"); } },
];
