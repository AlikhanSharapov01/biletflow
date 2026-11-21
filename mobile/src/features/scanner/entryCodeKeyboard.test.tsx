import { act, fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import { Keyboard, Platform, type KeyboardEvent } from "react-native";

import { ConfirmationPanel } from "@/features/scanner/ConfirmationPanel";
import { useKeyboardOverlap } from "@/features/scanner/useKeyboardOverlap";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));

// Found on an iPhone (#53): the number pad has no Return key and covered the
// code being typed, so the keyboard could not be closed.
describe("entry code keyboard", () => {
  let dismiss: jest.SpyInstance;
  beforeEach(() => {
    dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("closes the keyboard by itself once all 8 digits are typed", async () => {
    await render(<ConfirmationPanel error={null} onSubmitCode={jest.fn()} onCancel={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText("Entry code"), "1234567");
    expect(dismiss).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Entry code"), "12345678");
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("offers a Done bar above the iPhone number pad", async () => {
    expect(Platform.OS).toBe("ios");
    await render(<ConfirmationPanel error={null} onSubmitCode={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByLabelText("Entry code").props.inputAccessoryViewID).toBe("entry-code-done");
    await fireEvent.press(screen.getByText("Done"));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("lifts the scan panels by the part of the keyboard inside the scan area", async () => {
    const listeners: Record<string, (event: KeyboardEvent) => void> = {};
    jest.spyOn(Keyboard, "addListener").mockImplementation(((name: string, listener: (event: KeyboardEvent) => void) => {
      listeners[name] = listener;
      return { remove: jest.fn() };
    }) as never);
    const { result } = await renderHook(() => useKeyboardOverlap());
    expect(result.current).toBe(0);

    await act(async () => listeners.keyboardWillShow!({ endCoordinates: { height: 336 } } as KeyboardEvent));
    // 336 keyboard minus the 34 bottom inset already outside the scan area.
    expect(result.current).toBe(302);

    await act(async () => listeners.keyboardWillHide!({ endCoordinates: { height: 0 } } as KeyboardEvent));
    expect(result.current).toBe(0);
  });

  it("leaves Android alone, which resizes the window for the keyboard", async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    try {
      const add = jest.spyOn(Keyboard, "addListener");
      const { result } = await renderHook(() => useKeyboardOverlap());
      expect(add).not.toHaveBeenCalled();
      expect(result.current).toBe(0);
    } finally {
      Object.defineProperty(Platform, "OS", { value: original, configurable: true });
    }
  });
});
