import fs from "fs";
import path from "path";

import { colors, eventArt, statusTones } from "@/theme";

// The web stylesheet is the source of truth for colours; every mobile colour with a
// web token of the same role must carry the same value.
const css = fs.readFileSync(path.resolve(__dirname, "../../../web/src/styles/tokens.css"), "utf8");
const tokens = new Map<string, string>();
for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) tokens.set(match[1]!, match[2]!.trim().toLowerCase());

const colorTokens: Record<keyof typeof colors, string> = {
  ink: "--ink",
  muted: "--muted",
  faint: "--faint",
  line: "--line",
  lineSoft: "--line-soft",
  paper: "--paper",
  canvas: "--canvas",
  sidebar: "--sidebar",
  green: "--green",
  greenDark: "--green-dark",
  greenStory: "--green-story",
  lime: "--lime",
  coral: "--coral",
  yellow: "--yellow",
  error: "--error",
  danger: "--danger",
  dangerLine: "--danger-line",
  note: "--note",
  dateTile: "--date-tile",
  dateTileInk: "--date-tile-ink",
  avatar: "--avatar",
  avatarInk: "--avatar-ink",
  tabTrack: "--tab-track",
  activeNav: "--active-nav",
  inputLine: "--input-line",
  placeholder: "--placeholder",
};

describe("theme parity with web tokens", () => {
  it.each(Object.entries(colorTokens))("colors.%s equals %s", (key, token) => {
    expect(tokens.has(token)).toBe(true);
    expect(colors[key as keyof typeof colors].toLowerCase()).toBe(tokens.get(token));
  });

  it.each(Object.entries(statusTones))("statusTones.%s equals the --tone tokens", (tone, value) => {
    expect(value.background.toLowerCase()).toBe(tokens.get(`--tone-${tone}-bg`));
    expect(value.color.toLowerCase()).toBe(tokens.get(`--tone-${tone}`));
  });

  it.each(eventArt.map((stops, i) => [i, stops] as const))("eventArt[%i] equals --art-%i", (i, stops) => {
    expect(stops.join(", ").toLowerCase()).toBe(tokens.get(`--art-${i}`));
  });
});
