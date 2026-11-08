import { request } from "./client";
import { requestBlob, type DownloadedFile } from "./files";
import type { CalendarLinks } from "./types/calendar";

export function getCalendarLinks(eventId: string): Promise<CalendarLinks> {
  return request<CalendarLinks>(`/api/v1/events/${encodeURIComponent(eventId)}/calendar-links`);
}

// For events whose .ics needs the bearer token (anything but public).
export function downloadIcs(icsPath: string, eventId: string): Promise<DownloadedFile> {
  return requestBlob(icsPath, `biletflow-event-${eventId}.ics`);
}
