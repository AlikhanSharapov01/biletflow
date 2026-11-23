import { useId, type ReactElement } from "react";

export type NavIconId = "discover" | "tickets" | "orders" | "organizer" | "support" | "admin";

interface IconParts {
  /** The outer shape: outlined, or filled in the filled variant. */
  shape: ReactElement;
  /** Lines inside the shape: drawn, or cut out of the fill. */
  detail: ReactElement;
  /** Lines outside the shape, drawn in both variants. */
  extra?: ReactElement;
}

// Line icons for the phone tab bar: 24x24, drawn with the current text colour so
// the active and inactive states follow the link. The selected section uses the
// filled variant, so it is marked by shape as well as colour.
const PARTS: Record<NavIconId, IconParts> = {
  // Compass.
  discover: {
    shape: <circle cx="12" cy="12" r="9" />,
    detail: <path d="m15.5 8.5-2 5-5 2 2-5z" />,
  },
  // Ticket with notches on both sides and a perforation.
  tickets: {
    shape: <path d="M3 9.5V7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 0 0 5V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2.5a2.5 2.5 0 0 0 0-5Z" />,
    detail: <path d="M14 6.5v11" strokeDasharray="2 2" strokeLinecap="butt" />,
  },
  // Receipt with a zigzag edge and lines.
  orders: {
    shape: <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5L10 21l-2-1.5L6 21Z" />,
    detail: <path d="M9 8h6M9 12h6" />,
  },
  // Calendar with its two rings.
  organizer: {
    shape: <rect x="3.5" y="5" width="17" height="15.5" rx="2" />,
    detail: <path d="M3.5 10h17" />,
    extra: <path d="M8 3v4M16 3v4" />,
  },
  // Speech bubble.
  support: {
    shape: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4 4v-4H5.5A1.5 1.5 0 0 1 4 14.5Z" />,
    detail: <path d="M8.5 9h7M8.5 12h4" />,
  },
  // Shield with a check.
  admin: {
    shape: <path d="M12 3 4.5 6v5.5c0 4.5 3 7.7 7.5 9.5 4.5-1.8 7.5-5 7.5-9.5V6Z" />,
    detail: <path d="m9 12 2.2 2.2L15.5 10" />,
  },
};

export function NavIcon({ id, filled = false }: { id: NavIconId; filled?: boolean }) {
  // Mask ids must be unique per icon and safe inside url(#...).
  const maskId = `nav-icon-mask-${useId().replace(/[^\w-]/g, "")}`;
  const { shape, detail, extra } = PARTS[id];
  return (
    <svg
      className="tab-bar-icon"
      data-variant={filled ? "filled" : "outline"}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {filled ? (
        <>
          {/* White keeps the fill; the black details cut through it, same width as the drawn lines. */}
          <mask id={maskId}>
            <rect width="24" height="24" fill="white" stroke="none" />
            <g fill="black" stroke="black">{detail}</g>
          </mask>
          <g mask={`url(#${maskId})`}>
            <g fill="currentColor">{shape}</g>
          </g>
        </>
      ) : (
        <>
          {shape}
          {detail}
        </>
      )}
      {extra}
    </svg>
  );
}
