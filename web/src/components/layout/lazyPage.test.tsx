import { fireEvent, render as renderBare, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useNavigate, useParams } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lazyPage } from "./lazyPage";

const render = (ui: ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("lazyPage", () => {
  it("shows the loading state, then the page once its chunk arrives", async () => {
    const Page = lazyPage(
      () => Promise.resolve({ Loaded: () => <p>Loaded page</p> }),
      (m) => m.Loaded,
    );
    render(<Page />);
    expect(screen.getByRole("status").textContent).toContain("Loading");
    expect(await screen.findByText("Loaded page")).toBeTruthy();
  });

  it("offers a page reload when the chunk fails to load", async () => {
    // React reports the error caught by the boundary.
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    const Page = lazyPage(
      () => Promise.reject(new TypeError("Failed to fetch dynamically imported module: /assets/x.js")),
      () => () => null,
    );
    render(<Page />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn’t load this page");
    expect(alert.textContent).toContain("updated");
    fireEvent.click(screen.getByRole("button", { name: "Reload page" }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalled();
  });

  it("shows a generic message and retries in place for other render errors", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let broken = true;
    const Page = lazyPage(
      () =>
        Promise.resolve({
          Flaky: () => {
            if (broken) throw new Error("boom");
            return <p>Recovered page</p>;
          },
        }),
      (m) => m.Flaky,
    );
    render(<Page />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("updated");
    expect(alert.textContent).toContain("Something went wrong");
    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Recovered page")).toBeTruthy();
    expect(logged).toHaveBeenCalled();
  });

  it("renders the page again after navigating to another path served by the same route", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Page = lazyPage(
      () =>
        Promise.resolve({
          Event: () => {
            if (useParams().id === "A") throw new Error("boom");
            return <p>Event B</p>;
          },
        }),
      (m) => m.Event,
    );
    function Jump() {
      const navigate = useNavigate();
      return <button onClick={() => navigate("/events/B")}>Go to B</button>;
    }
    renderBare(
      <MemoryRouter initialEntries={["/events/A"]}>
        <Jump />
        <Routes><Route path="/events/:id" element={<Page />} /></Routes>
      </MemoryRouter>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong");
    fireEvent.click(screen.getByRole("button", { name: "Go to B" }));
    expect(await screen.findByText("Event B")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
