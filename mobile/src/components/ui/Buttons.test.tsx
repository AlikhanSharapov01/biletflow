import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Animated, StyleSheet } from "react-native";

import { PrimaryButton, SubtleButton, TextButton } from "@/components/ui/Buttons";
import { motion } from "@/theme";

let spring: jest.SpyInstance;
beforeEach(() => {
  spring = jest.spyOn(Animated, "spring").mockImplementation(() => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }) as never);
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

describe("press feedback", () => {
  it.each([
    ["primary", <PrimaryButton key="p" label="Go" onPress={jest.fn()} />],
    ["subtle", <SubtleButton key="s" label="Go" onPress={jest.fn()} />],
    ["text", <TextButton key="t" label="Go" onPress={jest.fn()} />],
  ])("%s button springs to the press scale and back", async (_name, button) => {
    await render(button);
    const target = screen.getByRole("button");
    await fireEvent(target, "pressIn");
    expect(spring).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: motion.pressScale, useNativeDriver: true, bounciness: 0, speed: motion.pressIn.speed }),
    );
    await fireEvent(target, "pressOut");
    expect(spring).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 1, useNativeDriver: true, bounciness: 0, speed: motion.pressOut.speed }),
    );
  });

  it("dims instead of scaling when reduced motion is on", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    await render(<PrimaryButton label="Go" onPress={jest.fn()} />);
    await act(async () => {});
    await fireEvent(screen.getByRole("button"), "pressIn");
    const style = StyleSheet.flatten(screen.getByRole("button").props.style);
    expect(style.transform).toBeUndefined();
    expect(style.opacity).toBeDefined();
    expect(spring).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ toValue: motion.pressScale }));
  });

  it("follows the reduce-motion setting as it changes and unsubscribes on unmount", async () => {
    const remove = jest.fn();
    const add = jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove } as never);
    const view = await render(<PrimaryButton label="Go" onPress={jest.fn()} />);
    await act(async () => {});
    expect(add).toHaveBeenCalledWith("reduceMotionChanged", expect.any(Function));
    await act(async () => add.mock.calls[0]![1](true));
    expect(screen.getByRole("button")).toBeTruthy();
    await view.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it("ignores presses while busy", async () => {
    const onPress = jest.fn();
    await render(<PrimaryButton label="Go" loading onPress={onPress} />);
    await fireEvent.press(screen.getByRole("button"));
    await fireEvent(screen.getByRole("button"), "pressIn");
    expect(onPress).not.toHaveBeenCalled();
    expect(spring).not.toHaveBeenCalled();
  });

  it("fires onPress for an idle button", async () => {
    const onPress = jest.fn();
    await render(<PrimaryButton label="Go" onPress={onPress} />);
    await fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  describe.each([
    ["off", false],
    ["on", true],
  ])("with reduced motion %s", (_name, reduced) => {
    it.each([
      ["a disabled primary", <PrimaryButton key="p" label="Go" disabled onPress={jest.fn()} />],
      ["a busy primary", <PrimaryButton key="b" label="Go" loading onPress={jest.fn()} />],
      ["a disabled subtle", <SubtleButton key="s" label="Go" disabled onPress={jest.fn()} />],
      ["a busy subtle", <SubtleButton key="sb" label="Go" loading onPress={jest.fn()} />],
      ["a disabled text", <TextButton key="t" label="Go" disabled onPress={jest.fn()} />],
    ])("%s button stays dimmed", async (_label, button) => {
      jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(reduced);
      await render(button);
      await act(async () => {});
      expect(StyleSheet.flatten(screen.getByRole("button").props.style).opacity).toBe(0.55);
    });
  });
});
