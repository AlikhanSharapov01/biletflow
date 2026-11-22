import * as Haptics from "expo-haptics";

import { commitHaptic } from "@/utils/haptics";

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

it("fires a success notification on commit", () => {
  commitHaptic();
  expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
});
