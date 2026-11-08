import type { PlatformSetting } from "@/api/types/admin";

// The server compares expected_version with the newest version of the key,
// including a change scheduled for later.
export function expectedVersion(setting: Pick<PlatformSetting, "version" | "pending">): number {
  return setting.pending ? Math.max(setting.pending.version, setting.version) : setting.version;
}

export function settingValueError(raw: string, setting: Pick<PlatformSetting, "minimum" | "maximum">): string {
  if (raw.trim() === "") return "Enter a value.";
  const value = Number(raw);
  if (!Number.isInteger(value)) return "Settings are whole numbers.";
  if (value < setting.minimum || value > setting.maximum) return `Choose a value from ${setting.minimum} to ${setting.maximum}.`;
  return "";
}
