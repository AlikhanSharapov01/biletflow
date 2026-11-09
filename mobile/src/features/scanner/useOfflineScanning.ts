import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { downloadPackage, registerDevice, syncOperations } from "@/api/offline";
import { SessionExpiredError } from "@/api/session";
import type { SyncResult } from "@/api/types/offline";
import type { AssignedEvent, CheckInOutcome } from "@/api/types/scanner";
import { useAuth } from "@/features/auth/AuthContext";
import { decideOffline, TICKET_QR_PREFIX } from "@/features/scanner/offlineVerify";
import {
  loadOffline,
  saveProgress,
  savePackage,
  type OfflineProgress,
  type OfflineState,
} from "@/features/scanner/offlineStore";
import type { PendingScan } from "@/features/scanner/scanTypes";

const MAX_SYNC_BATCH = 200;

function progressOf({ queue, nextSequence, admitted, revocations }: OfflineState): OfflineProgress {
  return { queue, nextSequence, admitted, revocations };
}

function isUsable(state: OfflineState | null, at: string): state is OfflineState {
  return !!state && Date.parse(at) <= Date.parse(state.pkg.expires_at);
}

// A device key belongs to one account (409 device_key_taken otherwise), so each
// account on this phone gets its own.
async function deviceKeyFor(userId: string): Promise<string> {
  const name = `biletflow.scanner_device.${userId}`;
  const existing = await SecureStore.getItemAsync(name);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(name, created);
  return created;
}

function summarize(results: SyncResult["results"]): string {
  const count = (status: string) => results.filter((row) => row.status === status).length;
  const accepted = count("accepted") + count("duplicate");
  const parts = [`${accepted} admitted`];
  if (count("conflict")) parts.push(`${count("conflict")} sent to the organizer to review`);
  if (count("rejected")) parts.push(`${count("rejected")} rejected`);
  return `Synced: ${parts.join(", ")}.`;
}

// The saved offline list and scan queue for one event.
export function useOfflineScanning(eventId: string, onSynced: () => void) {
  const { profile } = useAuth();
  const userId = profile?.id;
  const supported = Platform.OS !== "web";
  const [state, setState] = useState<OfflineState | null>(null);
  const [loaded, setLoaded] = useState(!supported);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const current = useRef<OfflineState | null>(null);
  const syncing = useRef(false);
  // Scans and sync results land one at a time, each on the latest state.
  const writes = useRef<Promise<unknown>>(Promise.resolve());

  const apply = useCallback((next: OfflineState | null) => {
    current.current = next;
    setState(next);
  }, []);

  const update = useCallback(
    <T,>(change: (latest: OfflineState) => { next: OfflineState; result: T }): Promise<T | null> => {
      const run = writes.current.then(async () => {
        if (!current.current || !userId) return null;
        const { next, result } = change(current.current);
        if (next !== current.current) {
          await saveProgress(userId, eventId, progressOf(next));
          apply(next);
        }
        return result;
      });
      writes.current = run.catch(() => undefined);
      return run;
    },
    [apply, eventId, userId]
  );

  const sync = useCallback(
    async (quiet = false) => {
      if (syncing.current || !current.current?.queue.length) return;
      syncing.current = true;
      setBusy(true);
      if (!quiet) setNotice(null);
      const outcomes: SyncResult["results"] = [];
      try {
        for (;;) {
          const latest = current.current;
          if (!latest?.queue.length) break;
          const batch = latest.queue.slice(0, MAX_SYNC_BATCH).map((row) => row.operation);
          const response = await syncOperations(latest.deviceId, latest.pkg.package_id, batch);
          outcomes.push(...response.results);
          const done = new Set(response.results.map((row) => row.operation_id));
          await update((fresh) => {
            const queue = fresh.queue.filter((row) => !done.has(row.operation.operation_id));
            const next = {
              ...fresh,
              queue,
              admitted: [...response.refreshed.admitted_ticket_ids, ...queue.map((row) => row.ticketId)],
              revocations: response.refreshed.revocations,
            };
            return { next, result: null };
          });
          if (!done.size) break;
        }
        setNotice(summarize(outcomes));
        onSynced();
      } catch (err) {
        // Session couldn't be renewed: AuthContext is already redirecting to login.
        if (err instanceof SessionExpiredError) return;
        if (!quiet) setNotice(`Couldn't sync. Your scans are saved. ${err instanceof Error ? err.message : ""}`.trim());
      } finally {
        syncing.current = false;
        setBusy(false);
      }
    },
    [onSynced, update]
  );

  useEffect(() => {
    if (!supported) return;
    if (!userId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    loadOffline(userId, eventId)
      .catch(() => null)
      .then((saved) => {
        if (cancelled) return;
        apply(saved);
        setLoaded(true);
        void sync(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apply, eventId, supported, sync, userId]);

  async function prepare(event: AssignedEvent) {
    if (!userId || current.current?.queue.length) return;
    setBusy(true);
    setNotice(null);
    try {
      const device = await registerDevice(await deviceKeyFor(userId), Device.modelName ?? "Mobile scanner");
      const pkg = await downloadPackage(eventId, device.id);
      const saved = { deviceId: device.id, event, pkg };
      const progress: OfflineProgress = {
        queue: [],
        nextSequence: 1,
        admitted: pkg.manifest.admitted_ticket_ids,
        revocations: pkg.manifest.revocations,
      };
      await savePackage(userId, eventId, saved);
      await saveProgress(userId, eventId, progress);
      apply({ ...saved, ...progress });
      setNotice(`Offline list ready: ${pkg.manifest.tickets.length} tickets.`);
    } catch (err) {
      if (err instanceof SessionExpiredError) return;
      setNotice(err instanceof Error ? err.message : "Couldn't download the offline list.");
    } finally {
      setBusy(false);
    }
  }

  // The local decision for a scan the server couldn't be reached for; null when
  // this phone has no usable offline list or the scan can't be judged here.
  async function decide({ target, operationId, capturedAt }: PendingScan): Promise<CheckInOutcome | null> {
    const payload = target.qrPayload;
    if (!payload || !isUsable(current.current, capturedAt)) return null;
    const qrHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      payload.startsWith(TICKET_QR_PREFIX) ? payload.slice(TICKET_QR_PREFIX.length) : payload
    );
    try {
      return await update<CheckInOutcome>((latest) => {
        const result = decideOffline(latest.pkg.manifest, latest, { ...target, qrPayload: payload, qrHash, capturedAt });
        if (result.kind !== "queued") return { next: latest, result };
        const next: OfflineState = {
          ...latest,
          nextSequence: latest.nextSequence + 1,
          admitted: [...latest.admitted, result.ticket_id],
          queue: [
            ...latest.queue,
            {
              ticketId: result.ticket_id,
              operation: {
                operation_id: operationId,
                sequence_number: latest.nextSequence,
                kind: "check_in",
                captured_at: capturedAt,
                qr_payload: payload,
                entry_confirmation: target.entryConfirmation ?? "",
              },
            },
          ],
        };
        return { next, result };
      });
    } catch {
      // Not saved, so it must not be shown as accepted.
      return null;
    }
  }

  return {
    supported,
    loaded,
    busy,
    notice,
    pending: state?.queue.length ?? 0,
    expiresAt: state?.pkg.expires_at ?? null,
    savedEvent: state?.event ?? null,
    prepare,
    sync,
    decide,
  };
}

export type OfflineScanning = ReturnType<typeof useOfflineScanning>;
