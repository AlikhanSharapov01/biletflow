// Design tokens shared with the web client — values come from web/styles.css
// (:root custom properties and the component rules), so both clients read as
// one product.

import { Platform } from "react-native";

export const colors = {
  ink: "#172724",
  muted: "#7b8580",
  faint: "#a0a7a1",
  line: "#e4e7df",
  lineSoft: "#eef0ea",
  paper: "#fffefa",
  canvas: "#f6f5f0",
  sidebar: "#fbfaf6",
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
  tabTrack: "#ebece6",
  activeNav: "#e8f0e6",
  inputLine: "#dfe3dc",
  placeholder: "#a3aaa5",
} as const;

// .status pills: background + text colour per tone.
export const statusTones = {
  positive: { background: "#eef5e9", color: "#4a7151" },
  pending: { background: "#fff3dd", color: "#a57324" },
  blocked: { background: "#f9e9e4", color: "#b25845" },
  neutral: { background: "#edf0ef", color: "#68756d" },
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
  sans: Platform.select({
    ios: "Avenir Next",
    android: undefined,
    default: '"Avenir Next", Avenir, "Segoe UI", sans-serif',
  }),
};

export const radii = {
  input: 7,
  panel: 8,
  pill: 20,
} as const;

export const spacing = {
  gutter: 16,
  panel: 16,
  gap: 12,
} as const;
