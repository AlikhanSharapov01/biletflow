import { render, screen } from "@testing-library/react-native";
import { StyleSheet, useWindowDimensions } from "react-native";

import { PageHeading } from "@/components/ui/PageHeading";
import { typography } from "@/theme";

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })),
}));
const windowSize = jest.mocked(useWindowDimensions);

describe("PageHeading", () => {
  it("renders the title with the title type style", async () => {
    await render(<PageHeading eyebrow="Eyebrow" title="Events" />);
    const style = StyleSheet.flatten(screen.getByText("Events").props.style);
    expect(style).toMatchObject(typography.title);
  });

  // "Хабарландырулар." does not fit a 320-wide phone at 34pt and breaks mid-word.
  it("uses the compact title below 360 wide, with tracking scaled to its size", async () => {
    windowSize.mockReturnValue({ width: 320, height: 640, scale: 2, fontScale: 1 });
    await render(<PageHeading eyebrow="Eyebrow" title="Хабарландырулар." />);
    const style = StyleSheet.flatten(screen.getByText("Хабарландырулар.").props.style);
    expect(style).toMatchObject(typography.titleCompact);
    expect(style.fontSize).toBeLessThan(typography.title.fontSize);
    expect(style.letterSpacing).toBeCloseTo(-0.022 * style.fontSize!, 1);
  });
});
