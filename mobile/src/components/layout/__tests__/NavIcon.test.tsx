import { render } from "@testing-library/react-native";

import { NavIcon, type NavIconId } from "@/components/layout/NavIcon";

const IDS: NavIconId[] = ["discover", "tickets", "orders", "organizer", "support", "admin", "checkin", "account"];

describe("NavIcon", () => {
  it.each(IDS)("draws the %s icon in the given colour, hidden from assistive tech", async (id) => {
    const { container } = await render(<NavIcon id={id} color="#123456" />);
    const svg = container.queryAll((node) => node.type === "RNSVGSvgView")[0]!;
    expect(svg.props.stroke).toBe("#123456");
    expect(svg.props.strokeWidth).toBe(1.8);
    expect(svg.props.accessibilityElementsHidden).toBe(true);
    expect(svg.props.importantForAccessibility).toBe("no-hide-descendants");
  });
});
