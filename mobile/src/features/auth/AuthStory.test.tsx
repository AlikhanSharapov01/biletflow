import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { DisplayText } from "@/components/ui";
import { AuthStory } from "@/features/auth/AuthStory";
import { t } from "@/i18n";

const flat = (node: { props: Record<string, unknown> }) => StyleSheet.flatten(node.props.style as object) as { fontSize: number; lineHeight: number };

describe("display headings", () => {
  it("keeps the sign-in story title's line height at or above its size", async () => {
    await render(<AuthStory topInset={0} />);
    const style = flat(screen.getByText(new RegExp(t("auth.make_room"))));
    expect(style.fontSize).toBeGreaterThan(30);
    expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
  });

  it("derives a line height when a caller sets only the size", async () => {
    await render(<DisplayText style={{ fontSize: 26 }}>Heading</DisplayText>);
    const style = flat(screen.getByText("Heading"));
    expect(style.lineHeight).toBeGreaterThanOrEqual(26);
    expect(style.lineHeight).toBeLessThanOrEqual(26 * 1.3);
  });
});
