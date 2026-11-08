import { useEffect, useState } from "react";
import { AppState } from "react-native";

// True while the app is in the foreground. Polling screens pause when it is
// false, the phone's version of the web's document.visibilityState check.
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => subscription.remove();
  }, []);
  return active;
}
