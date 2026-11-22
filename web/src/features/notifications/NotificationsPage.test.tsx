import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listNotifications, markAllNotificationsRead } from "../../api/notifications";
import type { AppNotification } from "../../api/types/notifications";
import { NotificationsPage } from "./NotificationsPage";

vi.mock("../../api/notifications", () => ({
  listNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

const unread: AppNotification = {
  id: "n1", kind: "unknown", locale: "en", title: "Hello", body: "World", event_id: null,
  target: "none" as AppNotification["target"], payload: {}, read_at: null, created_at: "2026-11-01T10:00:00Z",
};

describe("notifications page", () => {
  it("is busy while Mark all read runs and sends the request once", async () => {
    vi.mocked(listNotifications).mockResolvedValue([unread]);
    vi.mocked(markAllNotificationsRead).mockReturnValue(new Promise(() => {}) as ReturnType<typeof markAllNotificationsRead>);
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );
    const button = await screen.findByRole("button", { name: "Mark all read" });
    await waitFor(() => expect(button.getAttribute("aria-disabled")).not.toBe("true"));
    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("true"));
    fireEvent.click(button);
    expect(markAllNotificationsRead).toHaveBeenCalledTimes(1);
  });
});
