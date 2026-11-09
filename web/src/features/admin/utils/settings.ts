import { t } from "../../../i18n";
import type { PlatformSetting } from "../../../api/types/admin";

// The server compares expected_version with the newest version of the key,
// including a change scheduled for later.
export function expectedVersion(setting: Pick<PlatformSetting, "version" | "pending">): number {
  return setting.pending ? Math.max(setting.pending.version, setting.version) : setting.version;
}

export function settingValueError(raw: string, setting: Pick<PlatformSetting, "minimum" | "maximum">): string {
  if (raw.trim() === "") return t("admin.setting_enter_value");
  const value = Number(raw);
  if (!Number.isInteger(value)) return t("admin.setting_integer");
  if (value < setting.minimum || value > setting.maximum) return t("admin.setting_range", { p0: setting.minimum, p1: setting.maximum });
  return "";
}
