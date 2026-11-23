import { render } from "@testing-library/react-native";

import TabsLayout from "@/app/(app)/(tabs)/_layout";

const mockScreens: { name: string; options: { tabBarIcon: (p: { color: string; focused: boolean; size: number }) => React.ReactElement } }[] = [];
jest.mock("expo-router", () => {
  const Tabs = ({ children }: { children: React.ReactNode }) => children;
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
});
