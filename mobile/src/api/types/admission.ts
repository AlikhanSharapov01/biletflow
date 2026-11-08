// Organizer admission history and offline sync conflicts
// (backend/ADMISSION_API.md, admission_history_api.py, offline_service.py).
import type { SeatSnapshot } from "./checkout";

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface PersonRef {
  id: string;
  display_name: string;
}

export interface CheckInRecord {
  check_in_id: string;
  ticket_id: string;
  attendee_name: string;
  ticket_type_name: string;
  seat: SeatSnapshot | null;
  source: "online" | "offline_sync";
  accepted_at: string;
  captured_at: string | null;
  scanner: PersonRef | null;
  device_label: string | null;
  operation_id: string | null;
  reversed_at: string | null;
  reversal: { reason: string; actor: PersonRef | null; created_at: string } | null;
}

export interface CheckInFilters {
  from?: string;
  to?: string;
  source?: "" | "online" | "offline_sync";
  state?: "" | "current" | "reversed";
  ticket_type_id?: string;
  q?: string;
}

export interface OfflineOperationView {
  operation_id: string;
  sequence_number: number;
  kind: "check_in" | "reverse" | string;
  status: string;
  rejection_code: string | null;
  ticket_id: string | null;
  ticket: { attendee_name: string; ticket_type_name: string } | null;
  device: { id: string; label: string };
  scanner_user_id: string;
  captured_at_device: string | null;
  device_reported_at: string | null;
  received_at_server: string;
}

export interface SyncConflict {
  id: string;
  event_id: string;
  status: "open" | "resolved";
  reason: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  resolution_note: string | null;
  operation: OfflineOperationView;
  existing_check_in: {
    id: string;
    accepted_at: string;
    source: string;
    scanner_user_id: string;
    reversed_at: string | null;
  } | null;
}

export interface ConflictResolution {
  note: string;
  reverse_existing_check_in?: boolean;
  reversal_reason?: string;
}
