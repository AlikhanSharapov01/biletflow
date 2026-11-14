import type { SeatSnapshot } from "@/api/types";
import { getLocale } from "@/i18n";
import { localizedStatus } from "@/i18n/status";
import { t } from "@/i18n";

const DEFAULT_DATE: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

export function dateLabel(value: string | null | undefined, options: Intl.DateTimeFormatOptions = DEFAULT_DATE): string {
  if (!value) return t("common.not_available");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("common.not_available");
  return new Intl.DateTimeFormat(getLocale(), options).format(date);
}

export function dayNumber(value: string): string {
  return dateLabel(value, { day: "2-digit" });
}

export function monthShort(value: string): string {
  return dateLabel(value, { month: "short" }).toUpperCase();
}

// "₸6640.00" in English; "6 640,00 ₸" in Kazakh and Russian. Written out
// rather than Intl.NumberFormat, whose tenge support varies between phones.
function money(minor: number): string {
  const amount = (Math.abs(minor) / 100).toFixed(2);
  if (getLocale() === "en") return `₸${amount}`;
  const [whole = "0", cents = "00"] = amount.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")},${cents}\u00a0₸`;
}

// Prices are stored in tiyn (minor units of KZT).
export function priceLabel(priceMinor: number): string {
  if (priceMinor === 0) return t("common.free");
  return money(priceMinor);
}

// Money amounts in reports, where zero is ₸0.00 rather than "Free".
export function amountLabel(amountMinor: number): string {
  return `${amountMinor < 0 ? "−" : ""}${money(amountMinor)}`;
}

export function tengeToMinor(tenge: string | number): number {
  const amount = Number(tenge);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// Converts a typed local date-time ("YYYY-MM-DD HH:mm", a space or "T"
// between date and time) to an ISO string, or null when it cannot be read.
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value.trim().replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T"));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// The reverse: an ISO timestamp as the local "YYYY-MM-DDTHH:mm" an input expects.
export function isoToLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Almaty";
}

export function seatLabel(seat: SeatSnapshot | null | undefined): string {
  if (!seat) return t("checkout.general_admission");
  return t("format.section_row_seat", { section: seat.section_label, row: seat.row_label, seat: seat.seat_label });
}

export function statusLabel(status: string): string {
  return localizedStatus(status);
}

// Emailed links (verify email, reset password, staff invitation) carry the
// token in the `#token=` fragment. On a phone the person pastes the whole link
// or just the token; either way this returns the token.
export function tokenFromLink(input: string): string {
  const text = input.trim();
  const match = /[#?&]token=([^&#\s]+)/.exec(text);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return /^https?:\/\//.test(text) ? "" : text;
}

export function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(clamped / 60);
  const rest = clamped % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
