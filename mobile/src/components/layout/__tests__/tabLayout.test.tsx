import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { colors } from "@/theme";

import TabsLayout from "@/app/(app)/(tabs)/_layout";

const mockScreens: { name: string; options: { tabBarIcon: (p: { color: string; focused: boolean; size: number }) => React.ReactElement } }[] = [];
let mockScreenOptions: Record<string, unknown> = {};
jest.mock("expo-router", () => {
  const Tabs = ({ children, screenOptions }: { children: React.ReactNode; screenOptions: Record<string, unknown> }) => {
    mockScreenOptions = screenOptions;
    return children;
  };
  Tabs.Screen = (props: (typeof mockScreens)[number]) => {
    mockScreens.push(props);
    return null;
  };
  return { Tabs };
});

describe("tab layout", () => {
  it("gives every tab an svg icon that follows the tab colour", async () => {
    await render(<TabsLayout />);
    expect(mockScreens.map((s) => s.name)).toEqual(["index", "tickets", "organizer", "check-in", "account"]);
    for (const screen of mockScreens) {
      const { container } = await render(screen.options.tabBarIcon({ color: "#abcdef", focused: false, size: 24 }));
      expect(container.queryAll((node) => node.type === "RNSVGSvgView")[0]!.props.stroke).toBe("#abcdef");
    }
  });

  it("tints the active tab green and draws a hairline top border", async () => {
    await render(<TabsLayout />);
    expect(mockScreenOptions.tabBarActiveTintColor).toBe(colors.green);
    expect(mockScreenOptions.tabBarInactiveTintColor).toBe(colors.muted);
    const bar = StyleSheet.flatten(mockScreenOptions.tabBarStyle as object) as { borderTopWidth: number };
    expect(bar.borderTopWidth).toBe(StyleSheet.hairlineWidth);
  });
});
