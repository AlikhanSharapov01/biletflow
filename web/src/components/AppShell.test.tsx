import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import { AppShell } from "./AppShell";

function authValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    status: "anonymous",
    profile: null,
    notice: "",
    signIn: vi.fn(),
    register: vi.fn(),
    signOut: vi.fn(),
    signOutEverywhere: vi.fn(),
    setProfile: vi.fn(),
    clearNotice: vi.fn(),
    ...overrides,
  };
}

function renderShell(value: AuthContextValue, path = "/discover") {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/discover" element={<p>Discover content</p>} />
            <Route path="/events/:eventId" element={<p>Event content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("AppShell", () => {
  it("offers sign-in to anonymous visitors and still renders the page", () => {
    renderShell(authValue({ status: "anonymous" }));
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("Discover content")).toBeTruthy();
    expect(screen.queryByText("Sign out")).toBeNull();
  });

  it("shows the signed-in profile and a sign-out button", () => {
    renderShell(
      authValue({
        status: "authenticated",
        profile: {
          id: "u1",
          email: "aida@example.com",
          display_name: "Aida Sarsen",
          locale: "en",
          email_verified_at: "2026-10-01T00:00:00Z",
          analytics_consent: false,
        },
      }),
    );
    expect(screen.getByText("Aida Sarsen")).toBeTruthy();
    expect(screen.getAllByText("AS").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("labels the event route in the breadcrumb", () => {
    renderShell(authValue({}), "/events/123");
    expect(screen.getByText("Event content")).toBeTruthy();
    expect(screen.getByText("Event")).toBeTruthy();
  });
});
