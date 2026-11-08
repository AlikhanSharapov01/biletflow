// Saved offline data for one account and event, in the app's private documents
// folder (a package is too large for the secure store). The package is written
// once; progress is rewritten after every scan so a restart loses nothing.

import { Directory, File, Paths } from "expo-file-system";

import type { OfflinePackage, OfflineRevocation, SyncOperation } from "@/api/types/offline";
import type { AssignedEvent } from "@/api/types/scanner";

export type SavedPackage = {
  deviceId: string;
  event: AssignedEvent;
  pkg: OfflinePackage;
};

export type QueuedScan = {
  ticketId: string;
  operation: SyncOperation;
};

export type OfflineProgress = {
  queue: QueuedScan[];
  nextSequence: number;
  admitted: string[];
  revocations: OfflineRevocation[];
};

export type OfflineState = SavedPackage & OfflineProgress;

function folder(userId: string): Directory {
  return new Directory(Paths.document, "offline-scans", encodeURIComponent(userId));
}

function fileFor(userId: string, name: string): File {
  return new File(folder(userId), encodeURIComponent(name));
}

// Writes beside the target first, so a crash can't leave half a file behind.
async function replace(userId: string, name: string, value: unknown): Promise<void> {
  folder(userId).create({ intermediates: true, idempotent: true });
  const temp = fileFor(userId, `${name}.tmp`);
  if (temp.exists) temp.delete();
  temp.create();
  await temp.write(JSON.stringify(value));
  const target = fileFor(userId, name);
  if (target.exists) target.delete();
  temp.move(target);
}

async function read<T>(userId: string, name: string): Promise<T | null> {
  // The .tmp copy is the newest complete one if a crash came between delete and move.
  for (const candidate of [name, `${name}.tmp`]) {
    const file = fileFor(userId, candidate);
    if (!file.exists) continue;
    try {
      return JSON.parse(await file.text()) as T;
    } catch {
      // A half-written .tmp; the other copy (or nothing) stands.
    }
  }
  return null;
}

export async function loadOffline(userId: string, eventId: string): Promise<OfflineState | null> {
  const saved = await read<SavedPackage>(userId, `${eventId}.package.json`);
  const progress = await read<OfflineProgress>(userId, `${eventId}.progress.json`);
  return saved && progress ? { ...saved, ...progress } : null;
}

export async function saveProgress(userId: string, eventId: string, progress: OfflineProgress): Promise<void> {
  await replace(userId, `${eventId}.progress.json`, progress);
}

export async function savePackage(userId: string, eventId: string, saved: SavedPackage): Promise<void> {
  await replace(userId, `${eventId}.package.json`, saved);
}
