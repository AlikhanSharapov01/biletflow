import type { SeatStatus } from "@/api/types/seating";
import { colors, statusTones } from "@/theme";

// Seat fill per availability status, shared by the map and its legend.
export const SEAT_COLORS: Record<SeatStatus, string> = {
  available: colors.green,
  unavailable: colors.faint,
  blocked: statusTones.blocked.color,
  held: colors.yellow,
  sold: colors.ink,
  refund_pending: colors.yellow,
};
