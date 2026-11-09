// Offline scanning wire types, mirroring backend/app/offline_schemas.py and the
// manifest built in backend/app/offline_service.py.

import type { Seat } from "@/api/types/scanner";

export type ScannerDevice = {
  id: string;
  device_key: string;
  label: string;
  revoked_at: string | null;
};

export type OfflineTicket = {
  ticket_id: string;
  qr_hash: string;
  ticket_type_name: string;
  holder: string;
  seat: Seat | null;
  status: string;
};

export type OfflineRevocation = {
  ticket_id: string;
  status: string;
};

export type OfflineManifest = {
  event: {
    id: string;
    admission_opens_at: string;
    admission_closes_at: string;
  };
  expires_at: string;
  entry_confirmation: { public_key: string };
  tickets: OfflineTicket[];
  revocations: OfflineRevocation[];
  admitted_ticket_ids: string[];
};

export type OfflinePackage = {
  package_id: string;
  expires_at: string;
  manifest: OfflineManifest;
};

export type SyncOperation = {
  operation_id: string;
  sequence_number: number;
  kind: "check_in";
  captured_at: string;
  qr_payload: string;
  entry_confirmation: string;
};

export type SyncOutcome = {
  operation_id: string;
  status: "accepted" | "duplicate" | "conflict" | "rejected";
  code: string | null;
};

export type SyncResult = {
  results: SyncOutcome[];
  refreshed: {
    revocations: OfflineRevocation[];
    admitted_ticket_ids: string[];
  };
};
