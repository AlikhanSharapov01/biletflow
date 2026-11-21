import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// How far the keyboard reaches into the scan area, so the panels at its bottom
// (entry code, undo reason, guest search) can sit above it. Only iOS needs
// this: the panels are absolutely positioned, which a KeyboardAvoidingView's
// padding does not move, while Android already resizes the window for the
// keyboard. The bottom safe-area inset is already outside the scan area.
export function useKeyboardOverlap(): number {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const show = Keyboard.addListener("keyboardWillShow", (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardWillHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return Math.max(0, height - insets.bottom);
}
