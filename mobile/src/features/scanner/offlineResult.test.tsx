import { render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { StyleSheet } from "react-native";

import { setLocale } from "@/i18n";
import { colors } from "@/theme";

import { feedback } from "./feedback";
import { describeOutcome } from "./outcomes";
import { ResultPanel } from "./ResultPanel";

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

const QUEUED = { kind: "queued" as const, ticket_id: "t1", attendee_name: "Aru A.", ticket_type_name: "VIP", seat: null };
const ADMITTED = {
  kind: "admitted" as const,
  result: "admitted" as const,
  check_in_id: "c1",
  ticket_id: "t1",
  event_id: "e1",
  attendee_name: "Aru A.",
  ticket_type_name: "VIP",
  seat: null,
  checked_in_at: "2026-11-08T10:00:00Z",
  replayed: false,
};

function panelColor(title: string): string | undefined {
  // The tone colours the panel that holds the title.
  let node = screen.getByText(title).parent;
  while (node) {
    const style = StyleSheet.flatten(node.props.style);
    if (style?.backgroundColor) return style.backgroundColor as string;
    node = node.parent;
  }
  return undefined;
}

// Decision 0003, A1: an offline scan never lets anyone in, so it must not
// look or feel like an admission.
describe("offline scan result", () => {
  afterEach(() => setLocale("en"));

  it("uses a neutral panel, not the admitted green, and offers no undo", async () => {
    const view = describeOutcome(QUEUED, "Asia/Almaty");
    await render(<ResultPanel result={{ name: "result", view, retryable: false }} onRetry={jest.fn()} onUndo={jest.fn()} onScanNext={jest.fn()} />);
    expect(panelColor("Looks valid – connect to confirm entry")).not.toBe(colors.green);
    expect(screen.queryByText("Undo")).toBeNull();
  });

  it("the real admission still uses the admitted green", async () => {
    const view = describeOutcome(ADMITTED, "Asia/Almaty");
    await render(<ResultPanel result={{ name: "result", view, retryable: false }} onRetry={jest.fn()} onUndo={jest.fn()} onScanNext={jest.fn()} />);
    expect(panelColor("Admitted")).toBe(colors.green);
  });

  it("vibrates as a warning, never as a success", () => {
    feedback(describeOutcome(QUEUED, "Asia/Almaty").tone);
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith("warning");
    feedback(describeOutcome(ADMITTED, "Asia/Almaty").tone);
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith("success");
  });

  it.each([
    ["kk", "Билет жарамды сияқты – кіруді растау үшін желіге қосылыңыз"],
    ["ru", "Похоже, билет действителен – подключитесь, чтобы подтвердить вход"],
  ] as const)("is translated in %s", async (locale, title) => {
    setLocale(locale);
    const view = describeOutcome(QUEUED, "Asia/Almaty");
    expect(view.title).toBe(title);
    expect(view.lines.join(" ")).not.toMatch(/[A-Za-z]{4,} [a-z]{3,}/);
  });
});
