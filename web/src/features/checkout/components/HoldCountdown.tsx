import { t, useLocale } from "../../../i18n";
import { formatCountdown } from "../../../utils/format";

// Spoken once when the hold crosses each threshold; the timer itself stays silent.
function announcement(secondsLeft: number): string {
  if (secondsLeft <= 0) return t("checkout.hold_expired_notice");
  if (secondsLeft <= 60) return t("checkout.hold_one_minute");
  if (secondsLeft <= 300) return t("checkout.hold_five_minutes");
  return "";
}

// Time left on the ten-minute hold; turns red in the last minute.
export function HoldCountdown({ secondsLeft }: { secondsLeft: number }) {
  useLocale();
  return (
    <>
      <span className={`countdown ${secondsLeft < 60 ? "urgent" : ""}`} role="timer">{t("checkout.held_for")}{" "}{formatCountdown(secondsLeft)}
      </span>
      <span className="visually-hidden" role="status">{announcement(secondsLeft)}</span>
    </>
  );
}
