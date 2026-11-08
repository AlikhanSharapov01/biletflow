import type { TabItem } from "@/components/ui";

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
  { id: "details", label: "Details" },
  { id: "tickets", label: "Ticket types" },
  { id: "seating", label: "Seating" },
  { id: "paid-sales", label: "Paid sales" },
  { id: "attendees", label: "Attendees" },
  { id: "check-ins", label: "Check-ins" },
  { id: "staff", label: "Staff" },
  { id: "campaigns", label: "Campaigns" },
  { id: "analytics", label: "Analytics" },
  { id: "finance", label: "Finance" },
  { id: "history", label: "History" },
];
