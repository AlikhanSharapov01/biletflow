// Client for offline scanning: the "Devices and offline operation" section of
// backend/ADMISSION_API.md, routes in backend/app/offline_api.py.

import { requestJson } from "@/api/session";
import type { OfflinePackage, ScannerDevice, SyncOperation, SyncResult } from "@/api/types/offline";
import { t } from "@/i18n";

const OFFLINE_MESSAGES: Record<string, string> = {
  get admission_closed() { return t("mobile.scan.admission_ended"); },
  get device_revoked() { return t("mobile.scan.device_removed"); },
  get device_key_taken() { return t("mobile.scan.device_other_account"); },
  get event_not_found() { return t("mobile.scan.not_assigned"); },
  get package_not_found() { return t("mobile.scan.list_other_account"); },
  get permission_denied() { return t("mobile.scan.no_permission"); },
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
