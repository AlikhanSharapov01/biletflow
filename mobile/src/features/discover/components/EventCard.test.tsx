import { fireEvent, render, screen } from "@testing-library/react-native";
import { Animated, StyleSheet } from "react-native";

import { EventCard } from "@/features/discover/components/EventCard";
import { cardShadow, colors, motion } from "@/theme";

jest.mock("@/hooks/useEventImage", () => ({ useEventImage: () => null }));
// Records the props the card gives its pressable (the host tree does not show Pressable's own props).
const mockPressableProps: Record<string, unknown>[] = [];
jest.mock("@/components/ui/pressFeedback", () => {
  const actual = jest.requireActual("@/components/ui/pressFeedback");
  const React = jest.requireActual("react");
  return {
    ...actual,
    AnimatedPressable: (props: Record<string, unknown>) => {
      mockPressableProps.push(props);
      return React.createElement(actual.AnimatedPressable, props);
    },
  };
});

afterEach(() => jest.restoreAllMocks());

const card = () => <EventCard index={0} category="Music" title="Jazz Night" meta="Sat, 20:00 · Almaty" onPress={jest.fn()} />;

describe("EventCard", () => {
  it("springs to the press scale on press-in with the native driver", async () => {
    const spring = jest.spyOn(Animated, "spring").mockImplementation(() => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }) as never);
    await render(card());
    await fireEvent(screen.getByRole("button"), "pressIn");
    expect(spring).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ toValue: motion.pressScale, useNativeDriver: true, bounciness: 0 }));
  });

  it("has no border, the card shadow and muted meta text", async () => {
    await render(card());
    const style = StyleSheet.flatten(screen.getByRole("button").props.style);
    expect(style.borderWidth).toBeUndefined();
    expect(style).toMatchObject(cardShadow);
    expect(StyleSheet.flatten(screen.getByText("Sat, 20:00 · Almaty").props.style).color).toBe(colors.muted);
  });
  // A scroll that starts on a card must not flash its press state or start the spring.
  it("waits before showing the press, so scrolling over a card does not press it", async () => {
    await render(card());
    expect(mockPressableProps.at(-1)?.unstable_pressDelay).toBe(120);
  });
});
