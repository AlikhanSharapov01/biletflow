// Mirrors CalendarLinks in backend/app/calendar_api.py.
export interface CalendarLinks {
  google: string;
  outlook: string;
  office365: string;
  ics_path: string;
  // False only for public events, whose .ics URL can be shared as a plain link.
  ics_requires_sign_in: boolean;
  calendar_sequence: number;
}
