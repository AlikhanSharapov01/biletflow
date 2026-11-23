import type { ReactElement } from "react";
import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

export type NavIconId =
  | "discover"
  | "tickets"
  | "orders"
  | "organizer"
  | "support"
  | "admin"
  | "checkin"
  | "account";

// Line icons for the tab bar: 24x24, stroked in the tab colour so the active and
// inactive states follow the tab. The first six are the web's icons; check-in and
// account have no web counterpart and use the same stroke.
const SHAPES: Record<NavIconId, ReactElement> = {
  // Compass.
  discover: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  // Ticket with notches on both sides and a perforation.
  tickets: (
    <>
      <Path d="M3 9.5V7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 0 0 5V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2.5a2.5 2.5 0 0 0 0-5Z" />
      <Path d="M14 6.5v11" strokeDasharray="2 2" strokeLinecap="butt" />
    </>
  ),
  // Receipt with a zigzag edge and lines.
  orders: (
    <>
      <Path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5L10 21l-2-1.5L6 21Z" />
      <Path d="M9 8h6M9 12h6" />
    </>
  ),
  // Calendar.
  organizer: (
    <>
      <Rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <Path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  // Speech bubble.
  support: (
    <>
      <Path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4 4v-4H5.5A1.5 1.5 0 0 1 4 14.5Z" />
      <Path d="M8.5 9h7M8.5 12h4" />
    </>
  ),
  // Shield with a check.
  admin: (
    <>
      <Path d="M12 3 4.5 6v5.5c0 4.5 3 7.7 7.5 9.5 4.5-1.8 7.5-5 7.5-9.5V6Z" />
      <Path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  // Scan frame: four corners around a centre dot.
  checkin: (
    <>
      <Path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5" />
      <Rect x="9" y="9" width="6" height="6" rx="1" />
    </>
  ),
  // Person: head and shoulders.
  account: (
    <>
      <Circle cx="12" cy="8.5" r="3.5" />
      <Path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
};

export function NavIcon({ id, color }: { id: NavIconId; color: ColorValue }) {
  return (
    <Svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {SHAPES[id]}
    </Svg>
  );
}
