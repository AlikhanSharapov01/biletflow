import { colors, scanner } from "@/theme";

// The scanner's outcome panels carry white text (colors.onGreen) on these fills; like every web
// text pair, they must reach 4.5:1.
function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((digit) => digit + digit).join("") : value;
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16) / 255).map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

describe("scanner panel colours", () => {
  it.each(["warning", "pending", "neutral"] as const)("white text on scanner.%s reaches 4.5:1", (tone) => {
    expect(contrast(colors.onGreen, scanner[tone])).toBeGreaterThanOrEqual(4.5);
  });
});
