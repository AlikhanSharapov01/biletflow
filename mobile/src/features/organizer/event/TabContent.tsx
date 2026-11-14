import type { Category, EventView, Venue } from "@/api/types";

import { AnalyticsTab } from "./AnalyticsTab";
import { AttendeesTab } from "./AttendeesTab";
import { CampaignsTab } from "./CampaignsTab";
import { CheckInsTab } from "./CheckInsTab";
import { DetailsTab } from "./DetailsTab";
import type { EventTab } from "./eventTabs";
import { FinanceTab } from "./FinanceTab";
import { HistoryTab } from "./HistoryTab";
import { PaidSalesTab } from "./PaidSalesTab";
import { SeatingTab } from "./SeatingTab";
import { StaffTab } from "./StaffTab";
import { TicketTypesTab } from "./TicketTypesTab";
import { useLocale } from "@/i18n";

interface TabContentProps {
  tab: EventTab;
  event: EventView;
  categories: Category[];
  venues: Venue[];
  onSaved: () => void;
}

export function TabContent({ tab, event, categories, venues, onSaved }: TabContentProps) {
  useLocale();
  switch (tab) {
    case "details":
      return <DetailsTab key={event.updated_at} event={event} categories={categories} venues={venues} onSaved={onSaved} />;
    case "tickets":
      return <TicketTypesTab event={event} />;
    case "seating":
      return <SeatingTab event={event} />;
    case "paid-sales":
      return <PaidSalesTab event={event} />;
    case "attendees":
      return <AttendeesTab event={event} />;
    case "check-ins":
      return <CheckInsTab event={event} />;
    case "staff":
      return <StaffTab event={event} />;
    case "campaigns":
      return <CampaignsTab event={event} />;
    case "analytics":
      return <AnalyticsTab event={event} />;
    case "finance":
      return <FinanceTab event={event} />;
    case "history":
      return <HistoryTab event={event} />;
  }
}
