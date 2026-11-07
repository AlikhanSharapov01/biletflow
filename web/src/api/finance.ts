import { request } from "./client";
import type { EventFinance } from "./types/finance";

// PLANNED contract: gross, fees, refunds and the estimated payout of one event.
export function getEventFinance(eventId: string): Promise<EventFinance> {
  return request<EventFinance>(`/api/v1/events/${encodeURIComponent(eventId)}/finance`);
}
