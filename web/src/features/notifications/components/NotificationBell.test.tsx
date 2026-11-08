import { act, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { unreadNotificationCount } from "../../../api/notifications";
import { announceNotificationsChanged } from "../notificationTarget";
import { NotificationBell } from "./NotificationBell";

vi.mock("../../../api/notifications", () => ({ unreadNotificationCount: vi.fn() }));
const countMock = vi.mocked(unreadNotificationCount);

function renderBell() {
  return render(
    <MemoryRouter initialEntries={["/discover"]}>
      <NotificationBell />
      <Link to="/tickets">Go to tickets</Link>
    </MemoryRouter>,
  );
}

async function flush() {
  await act(async () => undefined);
}

afterEach(() => {
  vi.useRealTimers();
  countMock.mockReset();
});

describe("NotificationBell", () => {
  it("links to the inbox without a badge when nothing is unread", async () => {
    countMock.mockResolvedValue(0);
    renderBell();
    await flush();
    const link = screen.getByRole("link", { name: "Notifications" });
    expect(link.getAttribute("href")).toBe("/notifications");
    expect(link.querySelector(".notification-badge")).toBeNull();
  });

  it("shows the unread count in its name and badge, capped at 99+", async () => {
    countMock.mockResolvedValue(3);
    const { unmount } = renderBell();
    await flush();
    expect(screen.getByRole("link", { name: "Notifications, 3 unread" }).textContent).toBe("3");
    unmount();

    countMock.mockResolvedValue(150);
    renderBell();
    await flush();
    expect(screen.getByRole("link", { name: "Notifications, 150 unread" }).textContent).toBe("99+");
  });

  it("keeps working when the count cannot be loaded", async () => {
    countMock.mockRejectedValue(new Error("offline"));
    renderBell();
    await flush();
    expect(screen.getByRole("link", { name: "Notifications" })).toBeTruthy();
  });

  it("refreshes when the inbox announces a change", async () => {
    countMock.mockResolvedValueOnce(4).mockResolvedValueOnce(0);
    renderBell();
    await flush();
    expect(screen.getByRole("link", { name: "Notifications, 4 unread" })).toBeTruthy();

    await act(async () => announceNotificationsChanged());
    expect(screen.getByRole("link", { name: "Notifications" })).toBeTruthy();
    expect(countMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes on route changes", async () => {
    countMock.mockResolvedValue(1);
    renderBell();
    await flush();
    await act(async () => fireEvent.click(screen.getByRole("link", { name: "Go to tickets" })));
    expect(countMock).toHaveBeenCalledTimes(2);
  });

  it("polls every minute only while the tab is visible", async () => {
    vi.useFakeTimers();
    countMock.mockResolvedValue(0);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    renderBell();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(countMock).toHaveBeenCalledTimes(2);

    visibility.mockReturnValue("hidden");
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(countMock).toHaveBeenCalledTimes(2);
    visibility.mockRestore();
  });

  it("stops listening after unmount", async () => {
    countMock.mockResolvedValue(0);
    const { unmount } = renderBell();
    await flush();
    unmount();
    announceNotificationsChanged();
    expect(countMock).toHaveBeenCalledTimes(1);
  });
});
