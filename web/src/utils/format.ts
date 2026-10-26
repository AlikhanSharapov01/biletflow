import type { SeatSnapshot } from "../api/types";

const DEFAULT_DATE: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

export function dateLabel(value: string | null | undefined, options: Intl.DateTimeFormatOptions = DEFAULT_DATE): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

export function dayNumber(value: string): string {
  return dateLabel(value, { day: "2-digit" });
}

export function monthShort(value: string): string {
  return dateLabel(value, { month: "short" }).toUpperCase();
}

// Prices are stored in tiyn (minor units of KZT).
export function priceLabel(priceMinor: number): string {
  if (priceMinor === 0) return "Free";
  return `₸${(priceMinor / 100).toFixed(2)}`;
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

// Converts a datetime-local input value to an ISO string, or null when the
// browser gave us something unparsable.
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
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
  if (!seat) return "General admission";
  return `Section ${seat.section_label} · Row ${seat.row_label} · Seat ${seat.seat_label}`;
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

// Reads `#token=…` from the address bar once and removes it, so the token
// does not linger in history or get re-submitted on reload.
export function consumeHashToken(location: Location = window.location, history: History = window.history): string {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const token = params.get("token") ?? "";
  if (token) {
    const url = new URL(location.href);
    url.hash = "";
    history.replaceState(null, "", `${url.pathname}${url.search}`);
  }
  return token;
}

export function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(clamped / 60);
  const rest = clamped % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
