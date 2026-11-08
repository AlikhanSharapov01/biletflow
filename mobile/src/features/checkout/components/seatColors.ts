import { colors, statusTones } from "@/theme";
import type { SeatLook } from "../utils/seats";

// Border, fill and glyph colour per seat state (web checkout.css .seat-*).
export const SEAT_COLORS: Record<SeatLook, { border: string; fill: string; ink: string }> = {
  available: { border: colors.green, fill: colors.paper, ink: colors.green },
  selected: { border: colors.greenDark, fill: colors.green, ink: colors.paper },
  held: { border: statusTones.pending.color, fill: statusTones.pending.background, ink: statusTones.pending.color },
  sold: { border: statusTones.blocked.color, fill: statusTones.blocked.background, ink: statusTones.blocked.color },
  refund_pending: { border: statusTones.blocked.color, fill: statusTones.blocked.background, ink: statusTones.blocked.color },
  blocked: { border: colors.line, fill: statusTones.neutral.background, ink: colors.faint },
  unavailable: { border: colors.line, fill: statusTones.neutral.background, ink: colors.faint },
};
