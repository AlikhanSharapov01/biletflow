import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { ScrollScreen } from "@/components/layout/ScrollScreen";

jest.mock("@/components/layout/BackHeader", () => ({ BackHeader: () => null }));
jest.mock("@/components/layout/TopBar", () => ({ TopBar: () => null }));

// Found on an iPhone (#53): on the New case form the keyboard covered the
// subject and message fields, because pages did not make room for it.
describe("keyboard on scrolling pages", () => {
  it("makes room for the keyboard, scrolls the typed field into view and closes it on drag", async () => {
    await render(
      <ScrollScreen header="none">
        <Text>form</Text>
      </ScrollScreen>,
    );
    const scroll = screen.getByTestId("scroll-screen");
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(scroll.props.keyboardDismissMode).toBe("on-drag");
    // Taps on buttons still work while the keyboard is open.
    expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
  });
});
