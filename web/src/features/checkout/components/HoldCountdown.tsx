import { formatCountdown } from "../../../utils/format";

// Time left on the ten-minute hold; turns red in the last minute.
export function HoldCountdown({ secondsLeft }: { secondsLeft: number }) {
  return (
    <span className={`countdown ${secondsLeft < 60 ? "urgent" : ""}`} role="timer" aria-live="polite">
      Held for {formatCountdown(secondsLeft)}
    </span>
  );
}
