import fs from "fs";
import path from "path";

import { colors, eventArt, fonts, radii, statusTones } from "@/theme";

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
  buttonInk: "--button-ink",
  onGreen: "--on-green",
  errorTitle: "--error-title",
  errorText: "--error-text",
  storyEyebrow: "--story-eyebrow",
  storyFoot: "--story-foot",
  storySoft: "--story-soft",
  hoverLine: "--hover-line",
};

const radiusTokens: Record<keyof typeof radii, string> = {
  input: "--radius-input",
  button: "--radius-button",
  menu: "--radius-menu",
  panel: "--radius-panel",
  pill: "--radius-pill",
};

describe("theme parity with web tokens", () => {
  it.each(Object.entries(colorTokens))("colors.%s equals %s", (key, token) => {
    expect(tokens.has(token)).toBe(true);
    expect(colors[key as keyof typeof colors].toLowerCase()).toBe(tokens.get(token));
  });

  it.each(Object.entries(radiusTokens))("radii.%s equals %s", (key, token) => {
    expect(tokens.has(token)).toBe(true);
    expect(radii[key as keyof typeof radii]).toBe(Number.parseFloat(tokens.get(token)!));
  });

  it("pins the radii the restyle depends on", () => {
    expect(radii).toMatchObject({ input: 10, panel: 16, pill: 999 });
  });

  it("uses the web --font-sans stack on web", () => {
    jest.isolateModules(() => {
      jest.doMock("react-native", () => ({ Platform: { select: (o: Record<string, unknown>) => o.default } }));
      const theme = jest.requireActual("@/theme") as { fonts: typeof fonts };
      expect(theme.fonts.sans).toBe(css.match(/--font-sans:\s*([^;]+);/)![1]!.trim());
    });
  });

  it.each(Object.entries(statusTones))("statusTones.%s equals the --tone tokens", (tone, value) => {
    expect(value.background.toLowerCase()).toBe(tokens.get(`--tone-${tone}-bg`));
    expect(value.color.toLowerCase()).toBe(tokens.get(`--tone-${tone}`));
  });

  it.each(eventArt.map((stops, i) => [i, stops] as const))("eventArt[%i] equals --art-%i", (i, stops) => {
    expect(stops.join(", ").toLowerCase()).toBe(tokens.get(`--art-${i}`));
  });
});
