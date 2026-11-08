import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminMe, searchUsers } from "../api/admin";
import { ApiError } from "../api/errors";
import { listOrders } from "../api/orders";
import { AuthContext, type AuthContextValue } from "../features/auth/AuthContext";
import { makeAuthValue, makeProfile } from "../../tests/helpers/fixtures";
import { AppRoutes } from "./routes";

vi.mock("../api/admin", () => ({
  getAdminMe: vi.fn(),
  searchUsers: vi.fn(),
  moderateUser: vi.fn(),
}));
vi.mock("../api/notifications", () => ({
  unreadNotificationCount: vi.fn(() => Promise.resolve(0)),
  listNotifications: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock("../api/orders", () => ({
  listOrders: vi.fn(),
  getOrder: vi.fn(),
}));

const getAdminMeMock = vi.mocked(getAdminMe);
const searchUsersMock = vi.mocked(searchUsers);
const listOrdersMock = vi.mocked(listOrders);

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderAt(path: string, auth: AuthContextValue) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function currentPath(): string | null {
  return screen.getByTestId("location").textContent;
}

// Each signed-in test uses its own user id: admin answers are cached per user.
let userSeq = 0;
function signedIn(): AuthContextValue {
  userSeq += 1;
  return makeAuthValue({ status: "authenticated", profile: makeProfile({ id: `routes-user-${userSeq}` }) });
}

beforeEach(() => {
  // Pages whose API modules are not mocked here (e.g. Discover) never reach
  // the network: their requests simply stay pending.
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
  searchUsersMock.mockReturnValue(new Promise(() => undefined));
  listOrdersMock.mockReturnValue(new Promise(() => undefined));
});

afterEach(() => {
  vi.unstubAllGlobals();
  getAdminMeMock.mockReset();
  searchUsersMock.mockReset();
  listOrdersMock.mockReset();
});

describe("route guarding for anonymous visitors", () => {
  it.each(["/tickets", "/tickets/t1", "/orders", "/orders/o1", "/organizer", "/organizer/events/e1", "/account", "/support", "/notifications", "/admin", "/admin/users", "/admin/settings", "/staff-invitations/accept"])(
    "sends %s to sign-in without rendering it",
    async (path) => {
      renderAt(path, makeAuthValue({ status: "anonymous" }));
      await waitFor(() => expect(currentPath()).toBe("/sign-in"));
      expect(screen.getByLabelText("Email address")).toBeTruthy();
      expect(screen.queryByText("Admins only")).toBeNull();
      expect(listOrdersMock).not.toHaveBeenCalled();
      expect(searchUsersMock).not.toHaveBeenCalled();
      expect(getAdminMeMock).not.toHaveBeenCalled();
    },
  );

  it("keeps public pages public", () => {
    renderAt("/sign-in", makeAuthValue({ status: "anonymous" }));
    expect(currentPath()).toBe("/sign-in");
  });

  it("waits for the session check instead of redirecting or loading data", () => {
    renderAt("/orders", makeAuthValue({ status: "restoring" }));
    expect(currentPath()).toBe("/orders");
    expect(screen.getByText("Checking for an active session…")).toBeTruthy();
    expect(listOrdersMock).not.toHaveBeenCalled();
  });

  it("sends unknown paths to Discover", async () => {
    renderAt("/no-such-page", makeAuthValue({ status: "restoring" }));
    await waitFor(() => expect(currentPath()).toBe("/discover"));
  });
});

describe("platform admin portal", () => {
  it("shows a permission message, not admin tools, to a signed-in non-admin", async () => {
    getAdminMeMock.mockRejectedValue(new ApiError("This area is for platform administrators.", 403, "admin_required"));
    renderAt("/admin/users", signedIn());

    expect(await screen.findByText("Admins only")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Admin sections" })).toBeNull();
    expect(searchUsersMock).not.toHaveBeenCalled();
    // Both the top bar and the phone tab bar are "Main navigation".
    for (const mainNav of screen.getAllByRole("navigation", { name: "Main navigation" })) {
      expect(within(mainNav).queryByRole("link", { name: /Admin/ })).toBeNull();
    }
  });

  it("treats an explicit is_platform_admin=false as no access", async () => {
    getAdminMeMock.mockResolvedValue({ user_id: "x", is_platform_admin: false });
    renderAt("/admin/settings", signedIn());
    expect(await screen.findByText("Admins only")).toBeTruthy();
    expect(searchUsersMock).not.toHaveBeenCalled();
  });

  it("shows a neutral check, not admin tools, while the server answer is pending", () => {
    getAdminMeMock.mockReturnValue(new Promise(() => undefined));
    renderAt("/admin/users", signedIn());
    expect(screen.getByText("Checking admin access…")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Admin sections" })).toBeNull();
    expect(searchUsersMock).not.toHaveBeenCalled();
  });

  it("opens the portal for a confirmed admin and lands on Users", async () => {
    getAdminMeMock.mockResolvedValue({ user_id: "x", is_platform_admin: true });
    renderAt("/admin", signedIn());

    const adminNav = await screen.findByRole("navigation", { name: "Admin sections" });
    expect(within(adminNav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Users",
      "Events",
      "Orders",
      "Tickets",
      "Reports",
      "Moderation log",
      "Settings",
      "CSV exports",
    ]);
    await waitFor(() => expect(currentPath()).toBe("/admin/users"));
    await waitFor(() => expect(searchUsersMock).toHaveBeenCalled());
    for (const mainNav of screen.getAllByRole("navigation", { name: "Main navigation" })) {
      expect(within(mainNav).getByRole("link", { name: /Admin/ })).toBeTruthy();
    }
  });
});

describe("signed-in pages", () => {
  it("renders a protected page for a signed-in user", async () => {
    getAdminMeMock.mockResolvedValue({ user_id: "x", is_platform_admin: false });
    renderAt("/orders", signedIn());
    expect(currentPath()).toBe("/orders");
    await waitFor(() => expect(listOrdersMock).toHaveBeenCalledTimes(1));
  });

  it("sends a signed-in user away from the sign-in page", async () => {
    getAdminMeMock.mockReturnValue(new Promise(() => undefined));
    renderAt("/sign-in", signedIn());
    await waitFor(() => expect(currentPath()).toBe("/discover"));
  });
});
