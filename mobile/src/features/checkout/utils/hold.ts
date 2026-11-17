import { minutesLabel, t } from "@/i18n";

// The line under the reserve button. With the platform's hold time it names
// it ("held for 15 minutes"); without it, it says "a short time", never a
// guessed number.
export function holdHint(kind: "tickets" | "seats", minutes: number | null): string {
  if (minutes === null) return t(kind === "seats" ? "mobile.checkout.seat_hold_hint_short" : "mobile.checkout.hold_hint_short");
  return t(kind === "seats" ? "mobile.checkout.seat_hold_hint" : "mobile.checkout.hold_hint", { duration: minutesLabel(minutes) });
}
