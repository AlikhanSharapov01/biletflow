// Design tokens shared with the web client — values come from web/styles.css
// (:root custom properties and the component rules), so both clients read as
// one product.

import { Platform } from "react-native";

export const colors = {
  ink: "#1d1d1f",
  muted: "#68686d",
  faint: "#68686d",
  line: "#d2d2d7",
  lineSoft: "#e8e8ed",
  paper: "#ffffff",
  canvas: "#f5f5f7",
  sidebar: "#fbfbfd",
  green: "#236b55",
  greenDark: "#174a3b",
  greenStory: "#173c32",
  lime: "#d8f06a",
  coral: "#e9755d",
  yellow: "#f4c96b",
  error: "#a44735",
  danger: "#a85443",
  dangerLine: "#f0d8d2",
  note: "#eef3e6",
  dateTile: "#f3eee1",
  dateTileInk: "#726044",
  avatar: "#e6d7b9",
  avatarInk: "#604b2e",
  tabTrack: "#e8e8ed",
  activeNav: "#e8f0e6",
  inputLine: "#86868b",
  placeholder: "#6e6e73",
  buttonInk: "#636366",
  onGreen: "#fff",
  errorTitle: "#745247",
  errorText: "#79594f",
  storyEyebrow: "#bbd5b3",
  storyFoot: "#bed0c5",
  storySoft: "#e4e9de",
  hoverLine: "#a1a1a6",
} as const;

// .status pills: background + text colour per tone.
export const statusTones = {
  positive: { background: "#eef5e9", color: "#4a7151" },
  pending: { background: "#fff3dd", color: "#805313" },
  blocked: { background: "#f9e9e4", color: "#984432" },
  neutral: { background: "#e8e8ed", color: "#68686d" },
} as const;

export type StatusTone = keyof typeof statusTones;

// The four .live-art gradients used for event cards without an image; mobile
// draws the lighter and darker stops as two flat layers.
export const eventArt = [
  ["#d8e6d6", "#94b69b"],
  ["#eee0bf", "#c38b66"],
  ["#d4dbea", "#7b8faf"],
  ["#efdbd2", "#bb796c"],
] as const;

export const fonts = {
  // Georgia ships with iOS; Android maps "serif" to its system serif.
  serif: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" }),
  // The platform system font: SF on iOS, Roboto on Android (undefined selects it); the web --font-sans stack on web.
  sans: Platform.select({
    ios: undefined,
    android: undefined,
    default: "system-ui, -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
  }),
};

export const radii = {
  input: 10,
  button: 12,
  menu: 14,
  panel: 16,
  pill: 999,
} as const;

// Tracking tightens as size grows; leading is tighter on large text.
export const typography = {
  title: { fontSize: 34, fontWeight: "700", letterSpacing: -0.75, lineHeight: 38 },
  cardTitle: { fontSize: 20, fontWeight: "600", letterSpacing: -0.24, lineHeight: 25 },
  panelTitle: { fontSize: 17, fontWeight: "600", letterSpacing: -0.14, lineHeight: 22 },
  body: { fontSize: 15, lineHeight: 22 },
  micro: { fontSize: 11, letterSpacing: 0.11, lineHeight: 13 },
} as const;

// Press feedback: a critically damped spring (no bounce), quick in, slower out.
export const motion = {
  pressScale: 0.97,
  pressIn: { speed: 50, bounciness: 0 },
  pressOut: { speed: 20, bounciness: 0 },
} as const;

// Card depth: iOS shadow, Android elevation.
export const cardShadow = {
  shadowColor: "#000",
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

export const spacing = {
  gutter: 16,
  panel: 16,
  gap: 12,
} as const;

// Colours with no web token: translucent overlays, the scanner's outcome panels
// (drawn on the dark scan screen) and fixed black/white (QR code, camera backdrop).
export const overlays = {
  scrim: "rgba(23,39,36,0.35)",
  storyRing: "rgba(226,244,191,0.17)",
  artRing: "rgba(255,255,255,0.65)",
  artInk: "rgba(255,255,255,0.85)",
  onDark9: "rgba(255,255,255,0.9)",
  onDark8: "rgba(255,255,255,0.8)",
  onDark6: "rgba(255,255,255,0.6)",
  onDark5: "rgba(255,255,255,0.5)",
  onDark4: "rgba(255,255,255,0.4)",
  onDark25: "rgba(255,255,255,0.25)",
  onDark15: "rgba(255,255,255,0.15)",
  shade25: "rgba(0,0,0,0.25)",
  shade60: "rgba(0,0,0,0.6)",
} as const;

export const scanner = {
  warning: "#a57324",
  pending: "#3e5568",
  neutral: "#4f5c55",
  errorOnDark: "#fca5a5",
} as const;

export const fixed = {
  white: "#fff",
  black: "#000",
  qrInk: "#111111",
  shadowInk: "#1f332b",
} as const;
