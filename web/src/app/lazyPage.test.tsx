import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lazyPage } from "./lazyPage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("lazyPage", () => {
  it("shows the loading state, then the page once its chunk arrives", async () => {
    const Page = lazyPage(() => Promise.resolve({ default: () => <p>Loaded page</p> }));
    render(<Page />);
    expect(screen.getByRole("status").textContent).toContain("Loading");
    expect(await screen.findByText("Loaded page")).toBeTruthy();
  });

  it("shows an error panel with a reload action when the chunk fails to load", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    const Page = lazyPage(() => Promise.reject(new Error("Failed to fetch dynamically imported module")));
    render(<Page />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn’t load this page");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
