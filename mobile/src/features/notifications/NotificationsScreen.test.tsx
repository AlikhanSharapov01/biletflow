import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { listNotifications, markAllNotificationsRead, markNotificationRead, unreadNotificationCount } from "@/api/notifications";
import type { AppNotification } from "@/api/types/notifications";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { NotificationsScreen } from "@/features/notifications/NotificationsScreen";

const mockPush = jest.fn();
const mockNotify = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: mockNotify }) }));
jest.mock("@/api/notifications");

const unread: AppNotification = {
  id: "n1",
  kind: "ticket_delivered",
  locale: "en",
  title: "Your ticket is ready",
  body: "Almaty Jazz Night · Standard",
  event_id: "event-1",
  target: { type: "ticket", id: "ticket-1" },
  payload: {},
  read_at: null,
  created_at: "2026-11-01T10:00:00Z",
};

describe("NotificationsScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("marks a notification read and opens its target", async () => {
    jest.mocked(listNotifications).mockResolvedValue([unread]);
    jest.mocked(markNotificationRead).mockResolvedValue({ ...unread, read_at: "2026-11-01T10:05:00Z" });
    await render(<NotificationsScreen />);
    expect(listNotifications).toHaveBeenCalledWith({ unread_only: false, limit: 50, offset: 0 });
    await fireEvent.press(await screen.findByLabelText("Unread: Your ticket is ready"));
    expect(markNotificationRead).toHaveBeenCalledWith("n1");
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: "/tickets/[ticketId]", params: { ticketId: "ticket-1" } }));
  });

  it("marks everything read", async () => {
    jest.mocked(listNotifications).mockResolvedValue([unread]);
    jest.mocked(markAllNotificationsRead).mockResolvedValue(1);
    await render(<NotificationsScreen />);
    await screen.findByText("Your ticket is ready");
    await fireEvent.press(screen.getByText("Mark all read"));
    expect(markAllNotificationsRead).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith("Marked 1 notification as read."));
  });

  it("filters to unread and shows the empty state", async () => {
    jest.mocked(listNotifications).mockResolvedValue([]);
    await render(<NotificationsScreen />);
    expect(await screen.findByText("No notifications yet.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Unread"));
    expect(listNotifications).toHaveBeenLastCalledWith({ unread_only: true, limit: 50, offset: 0 });
    expect(await screen.findByText("You’re all caught up.")).toBeTruthy();
  });

  it("shows an error when the inbox cannot load", async () => {
    jest.mocked(listNotifications).mockRejectedValue(new Error("Can’t reach BiletFlow right now."));
    await render(<NotificationsScreen />);
    expect(await screen.findByText("We couldn’t load your notifications.")).toBeTruthy();
  });
});

describe("NotificationBell", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the unread count and opens the inbox", async () => {
    jest.mocked(unreadNotificationCount).mockResolvedValue(150);
    await render(<NotificationBell />);
    // The badge is hidden from screen readers; the button label carries the count.
    expect(await screen.findByText("99+", { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Notifications, 150 unread"));
    expect(mockPush).toHaveBeenCalledWith("/notifications");
  });
});
