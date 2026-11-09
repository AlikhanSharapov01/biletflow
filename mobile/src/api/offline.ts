// Client for offline scanning: the "Devices and offline operation" section of
// backend/ADMISSION_API.md, routes in backend/app/offline_api.py.

import { requestJson } from "@/api/session";
import type { OfflinePackage, ScannerDevice, SyncOperation, SyncResult } from "@/api/types/offline";

const OFFLINE_MESSAGES: Record<string, string> = {
  admission_closed: "Admission for this event has ended.",
  device_revoked: "This phone was removed from scanning. Ask the organizer for help.",
  device_key_taken: "This phone is registered to another account.",
  event_not_found: "You're not assigned to scan this event.",
  package_not_found: "This offline list no longer belongs to your account.",
  permission_denied: "You don't have permission to scan this event.",
};

function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(
    path,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    OFFLINE_MESSAGES
  );
}

// Same key and owner again returns the existing device.
export function registerDevice(deviceKey: string, label: string): Promise<ScannerDevice> {
  return postJson("/scanner/devices", { device_key: deviceKey, label });
}

export function downloadPackage(eventId: string, deviceId: string): Promise<OfflinePackage> {
  return postJson(`/scanner/events/${encodeURIComponent(eventId)}/offline-packages`, { device_id: deviceId });
}

// Safe to resend: the server reports an operation it already has as "duplicate".
export function syncOperations(
  deviceId: string,
  packageId: string,
  operations: SyncOperation[]
): Promise<SyncResult> {
  return postJson("/scanner/offline/sync", {
    device_id: deviceId,
    package_id: packageId,
    device_time: new Date().toISOString(),
    operations,
  });
}
