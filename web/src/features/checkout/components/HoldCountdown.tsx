import { t, useLocale } from "../../../i18n";
import { formatCountdown } from "../../../utils/format";

// Time left on the ten-minute hold; turns red in the last minute.
export function HoldCountdown({ secondsLeft }: { secondsLeft: number }) {
  useLocale();
  return (
    <span className={`countdown ${secondsLeft < 60 ? "urgent" : ""}`} role="timer" aria-live="polite">{t("checkout.held_for")}{" "}{formatCountdown(secondsLeft)}
    </span>
  );
}
