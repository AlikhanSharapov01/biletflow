import fs from "fs";
import path from "path";

import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { DisplayText, Eyebrow } from "@/components/ui/Text";
import { typography } from "@/theme";

const styleOf = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style);

describe("Eyebrow", () => {
  it("is semibold, as on the web", async () => {
    await render(<Eyebrow>Label</Eyebrow>);
    expect(styleOf("Label").fontWeight).toBe("600");
  });
});

describe("DisplayText", () => {
  it("tightens tracking with size for a large caller", async () => {
    await render(<DisplayText style={{ fontSize: 26 }}>Large</DisplayText>);
    expect(styleOf("Large").letterSpacing).toBeCloseTo(-0.022 * 26, 2);
    expect(styleOf("Large").lineHeight).toBe(31);
  });

  it("keeps the card title tracking at its own size", async () => {
    await render(<DisplayText>Card</DisplayText>);
    expect(styleOf("Card").letterSpacing).toBe(typography.cardTitle.letterSpacing);
  });

  it("keeps a caller's own tracking", async () => {
    await render(<DisplayText style={{ fontSize: 42, letterSpacing: -1.5 }}>Story</DisplayText>);
    expect(styleOf("Story").letterSpacing).toBe(-1.5);
  });
});

// The brand mark alone stays serif (web keeps it for .brand-mark and the sign-in story only).
describe("serif face", () => {
  it("is used by the brand mark only", () => {
    const root = path.resolve(__dirname, "../..");
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && fs.readFileSync(full, "utf8").includes("fonts.serif")) users.push(path.relative(root, full));
      }
    };
    walk(root);
    expect(users).toEqual(["components/ui/Brand.tsx"]);
  });
});
