import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../features/auth/AuthContext";
import { TabBar } from "./TabBar";

const admin = vi.hoisted(() => ({ isAdmin: false }));
vi.mock("../../features/admin/useIsPlatformAdmin", () => ({
  useIsPlatformAdmin: () => ({ isAdmin: admin.isAdmin }),
}));

const profile = {
  id: "u1",
  email: "aida@example.com",
  display_name: "Aida Sarsen",
  locale: "en",
  email_verified_at: "2026-10-01T00:00:00Z",
  analytics_consent: false,
} as const;

function renderBar(path = "/orders") {
  const value = { status: "authenticated", profile } as AuthContextValue;
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <TabBar />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("TabBar", () => {
  beforeEach(() => {
    admin.isAdmin = false;
  });

  it("shows one icon and the full label for each of the five sections", () => {
    renderBar();
    const links = within(screen.getByRole("navigation", { name: "Main navigation" })).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Discover", "Tickets", "Orders", "Organizer", "Support"]);
    for (const link of links) {
      const icons = link.querySelectorAll("svg");
      expect(icons).toHaveLength(1);
      expect(icons[0].getAttribute("aria-hidden")).toBe("true");
      expect(icons[0].getAttribute("focusable")).toBe("false");
    }
  });

  it("adds Admin for platform admins and marks the current section", () => {
    admin.isAdmin = true;
    renderBar("/orders/42");
    expect(screen.getAllByRole("link")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Admin" }).querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Orders" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Tickets" }).getAttribute("aria-current")).toBeNull();
  });
});
