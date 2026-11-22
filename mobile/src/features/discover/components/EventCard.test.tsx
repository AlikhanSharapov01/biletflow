import { fireEvent, render, screen } from "@testing-library/react-native";
import { Animated, StyleSheet } from "react-native";

import { EventCard } from "@/features/discover/components/EventCard";
import { cardShadow, colors, motion } from "@/theme";

jest.mock("@/hooks/useEventImage", () => ({ useEventImage: () => null }));

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
});
