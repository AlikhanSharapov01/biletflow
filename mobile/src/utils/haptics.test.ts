import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { commitHaptic } from "@/utils/haptics";

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

afterEach(() => {
  jest.clearAllMocks();
  Platform.OS = "ios";
});

it("fires a success notification on commit", () => {
  Platform.OS = "ios";
  commitHaptic();
  expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
});

it("does nothing on web", () => {
  Platform.OS = "web";
  commitHaptic();
  expect(Haptics.notificationAsync).not.toHaveBeenCalled();
});
