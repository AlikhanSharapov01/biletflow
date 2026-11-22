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

  // As on the web, the selected tab is marked by shape and weight, not by a background pill.
  it("fills the selected tab's icon and sets its label in semibold, without a background", async () => {
    await render(<TabsLayout />);
    expect(mockScreenOptions.tabBarActiveBackgroundColor).toBeUndefined();
    const svgNodes = (element: React.ReactElement) => render(element).then(({ container }) => container.queryAll((node) => node.type === "RNSVGMask"));
    for (const screen of mockScreens) {
      const selected = await svgNodes(screen.options.tabBarIcon({ color: "#abcdef", focused: true, size: 24 }));
      const unselected = await svgNodes(screen.options.tabBarIcon({ color: "#abcdef", focused: false, size: 24 }));
      expect({ name: screen.name, selected: selected.length, unselected: unselected.length }).toEqual({ name: screen.name, selected: 1, unselected: 0 });
    }
    const label = mockScreenOptions.tabBarLabel as (p: { focused: boolean; color: string; position: string; children: string }) => React.ReactElement;
    const weight = async (focused: boolean) => {
      const { getByText } = await render(label({ focused, color: "#abcdef", position: "below-icon", children: "Discover" }));
      return StyleSheet.flatten(getByText("Discover").props.style);
    };
    expect(await weight(true)).toMatchObject({ fontWeight: "600", color: "#abcdef" });
    expect(await weight(false)).toMatchObject({ fontWeight: "500", color: "#abcdef" });
  });
});
