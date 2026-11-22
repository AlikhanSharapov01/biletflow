import { t, useLocale } from "../../../i18n";
import { formatCountdown } from "../../../utils/format";

// What a screen reader hears about the hold: nothing until it runs low, then once per
// threshold. The caller renders it in a status region that outlives the countdown.
export function holdAnnouncement(secondsLeft: number): string {
  if (secondsLeft <= 0) return t("checkout.expired");
  if (secondsLeft < 60) return t("checkout.hold_one_minute");
  if (secondsLeft < 300) return t("checkout.hold_five_minutes");
  return "";
}

// Time left on the ten-minute hold; turns red in the last minute. Silent for
// assistive technology: see holdAnnouncement.
export function HoldCountdown({ secondsLeft }: { secondsLeft: number }) {
  useLocale();
  return (
    <span className={`countdown ${secondsLeft < 60 ? "urgent" : ""}`} role="timer">{t("checkout.held_for")}{" "}{formatCountdown(secondsLeft)}
    </span>
  );
}
