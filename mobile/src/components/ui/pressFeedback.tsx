import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable } from "react-native";

import { motion } from "@/theme";

export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Press feedback driven by a critically damped spring on the native driver: the
// control scales to motion.pressScale on press-in and returns to 1 on release.
// With reduced motion on, it dims to 0.7 instead of scaling.
export function usePressFeedback() {
  const value = useRef(new Animated.Value(1)).current;
  const [reduced, setReduced] = useState(false);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => live && setReduced(on))
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  const spring = useCallback(
    (toValue: number, config: { speed: number; bounciness: number }) =>
      Animated.spring(value, { toValue, ...config, useNativeDriver: true }).start(),
    [value],
  );
  const onPressIn = useCallback(() => {
    setPressed(true);
    spring(motion.pressScale, motion.pressIn);
  }, [spring]);
  const onPressOut = useCallback(() => {
    setPressed(false);
    spring(1, motion.pressOut);
  }, [spring]);

  const style = reduced
    ? { opacity: value.interpolate({ inputRange: [motion.pressScale, 1], outputRange: [0.7, 1], extrapolate: "clamp" }) }
    : { transform: [{ scale: value }] };
  return { pressed, onPressIn, onPressOut, style };
}
