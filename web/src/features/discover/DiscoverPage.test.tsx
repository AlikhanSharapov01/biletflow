import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listCategories, listEvents, listVenues } from "../../api/catalog";
import { deferred, makeEvent } from "../../../tests/helpers/fixtures";
import { DiscoverPage } from "./DiscoverPage";
import { DISCOVER_PAGE_SIZE, dateRange } from "./discoverQuery";

vi.mock("../../api/catalog", () => ({ listCategories: vi.fn(), listEvents: vi.fn(), listVenues: vi.fn() }));

const listEventsMock = vi.mocked(listEvents);
const listCategoriesMock = vi.mocked(listCategories);
const listVenuesMock = vi.mocked(listVenues);

const MUSIC = "0b9c1d52-4f0e-4a64-8d3a-6f1f7a5c2e11";
const categories = [
  { id: MUSIC, created_at: "", code: "music", name_en: "Music", name_ru: "Музыка", name_kk: "Музыка" },
  { id: "6a1e0c1e-1b0e-4a64-8d3a-6f1f7a5c2e22", created_at: "", code: "sport", name_en: "Sport", name_ru: "Спорт", name_kk: "Спорт" },
];
const venue = (id: string, city: string) => ({ id, created_at: "", name: `Hall ${id}`, address: "", city, country_code: "KZ" });
const venues = [venue("v1", "Almaty"), venue("v2", "astana"), venue("v3", "Almaty")];

const NOW = new Date(2026, 5, 10, 9); // a Wednesday

function events(count: number, from = 0) {
  return Array.from({ length: count }, (_, i) => makeEvent({ id: `e${from + i}`, title: `Event ${from + i}`, venue_id: "v1" }));
}

function Probe() {
  const location = useLocation();
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(url = "/discover") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DiscoverPage />
      <Probe />
    </MemoryRouter>,
  );
}

const url = () => screen.getByTestId("url").textContent;
const lastCall = () => listEventsMock.mock.calls.at(-1)![0]!;
const cards = () => document.querySelectorAll(".event-card");

function setPhone(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as never;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  listCategoriesMock.mockResolvedValue(categories);
  listVenuesMock.mockResolvedValue(venues);
  listEventsMock.mockResolvedValue(events(3));
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  // @ts-expect-error jsdom has no matchMedia unless a test installs one
  delete window.matchMedia;
});

describe("URL to request", () => {
  it("asks for the first page with the default size", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(listEventsMock).toHaveBeenCalledTimes(1);
    expect(lastCall()).toEqual({ limit: DISCOVER_PAGE_SIZE, offset: 0 });
  });

  it("maps every filter, with the date window from the clock", async () => {
    renderPage(`/discover?q=jazz&category=${MUSIC}&city=almaty&when=weekend&min_price=500&max_price=9000`);
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(lastCall()).toEqual({
      q: "jazz",
      category_id: MUSIC,
      city: "almaty",
      ...dateRange("weekend", NOW),
      min_price: 50000,
      max_price: 900000,
      limit: DISCOVER_PAGE_SIZE,
      offset: 0,
    });
    // The lowercase link still shows the venue's spelling of the city.
    expect((screen.getByLabelText("City") as HTMLSelectElement).value).toBe("Almaty");
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe(MUSIC);
  });

  it("maps today and month windows", async () => {
    const { unmount } = renderPage("/discover?when=today");
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(lastCall()).toMatchObject(dateRange("today", NOW));
    unmount();
    renderPage("/discover?when=month");
    await waitFor(() => expect(listEventsMock).toHaveBeenCalledTimes(2));
    expect(lastCall()).toMatchObject(dateRange("month", NOW));
  });

  it("free replaces the price range", async () => {
    renderPage("/discover?free=1&min_price=5&max_price=9");
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(lastCall()).toEqual({ free: true, limit: DISCOVER_PAGE_SIZE, offset: 0 });
  });

  it("lists the distinct venue cities once, sorted", async () => {
    renderPage();
    await waitFor(() => expect(within(screen.getByLabelText("City")).getAllByRole("option")).toHaveLength(3));
    const names = within(screen.getByLabelText("City")).getAllByRole("option").map((option) => option.textContent);
    expect(names).toEqual(["All cities", "Almaty", "astana"]);
  });
});

describe("filter form", () => {
  it("submitting writes the URL and requests the new search", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.change(screen.getByRole("textbox", { name: "Search events" }), { target: { value: " jazz " } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: MUSIC } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Almaty" } });
    fireEvent.change(screen.getByLabelText("When"), { target: { value: "month" } });
    fireEvent.change(screen.getByLabelText("Price from, ₸"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Price to, ₸"), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    expect(url()).toBe(`/discover?q=jazz&category=${MUSIC}&city=Almaty&when=month&min_price=100&max_price=2000`);
    await waitFor(() => expect(lastCall()).toMatchObject({ q: "jazz", city: "Almaty", min_price: 10000, max_price: 200000, offset: 0 }));
  });

  it("Free only disables and hides the price inputs", async () => {
    renderPage("/discover?min_price=100");
    await waitFor(() => expect(cards()).toHaveLength(3));
    const from = screen.getByLabelText("Price from, ₸");
    expect((from as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText("Free only"));
    expect((from as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Price to, ₸") as HTMLInputElement).disabled).toBe(true);
    expect(from.closest(".price-range")!.hasAttribute("hidden")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    expect(url()).toBe("/discover?free=1");
  });

  it("price inputs are numeric with a zero minimum", async () => {
    renderPage();
    const from = screen.getByLabelText("Price from, ₸");
    expect(from.getAttribute("inputmode")).toBe("numeric");
    expect(from.getAttribute("min")).toBe("0");
    expect(from.getAttribute("step")).toBe("1");
  });

  it("a price range that is backwards shows an error, focuses it and sends nothing", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    listEventsMock.mockClear();
    fireEvent.change(screen.getByLabelText("Price from, ₸"), { target: { value: "900" } });
    fireEvent.change(screen.getByLabelText("Price to, ₸"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    const to = screen.getByLabelText("Price to, ₸");
    expect(to.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(to);
    const message = screen.getByText("Minimum price can’t be higher than maximum price.");
    expect(to.getAttribute("aria-describedby")).toBe(message.id);
    expect(url()).toBe("/discover");
    expect(listEventsMock).not.toHaveBeenCalled();
    // Fixing the range goes through.
    fireEvent.change(to, { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    expect(url()).toBe("/discover?min_price=900&max_price=1000");
    await waitFor(() => expect(listEventsMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Minimum price can’t be higher than maximum price.")).toBeNull();
  });

  it("a backwards range typed into the URL shows the error without a request", async () => {
    renderPage("/discover?min_price=900&max_price=100");
    expect(await screen.findByText("Minimum price can’t be higher than maximum price.")).toBeTruthy();
    expect(listEventsMock).not.toHaveBeenCalled();
  });

  it("on a phone More filters shows how many are active and opens on load only then", async () => {
    setPhone(true);
    const { unmount } = renderPage("/discover?city=Almaty&min_price=5");
    expect(screen.getByText("More filters (2)")).toBeTruthy();
    expect(document.querySelector("details")!.hasAttribute("open")).toBe(true);
    unmount();
    renderPage("/discover?q=jazz");
    expect(screen.getByText("More filters")).toBeTruthy();
    expect(document.querySelector("details")!.hasAttribute("open")).toBe(false);
  });

  it("on a wide screen every field is open", () => {
    renderPage();
    expect(document.querySelector("details")!.hasAttribute("open")).toBe(true);
  });
});

describe("Load more", () => {
  it("appends the next page by offset, then hides on a short page", async () => {
    listEventsMock.mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE)).mockResolvedValueOnce(events(5, DISCOVER_PAGE_SIZE));
    renderPage("/discover?q=jazz");
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE + 5));
    expect(lastCall()).toMatchObject({ q: "jazz", limit: DISCOVER_PAGE_SIZE, offset: DISCOVER_PAGE_SIZE });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(document.querySelector("[role=status]")!.textContent).toBe(`Events shown: ${DISCOVER_PAGE_SIZE + 5}`);
    // Categories and venues are fetched once for the visit.
    expect(listCategoriesMock).toHaveBeenCalledTimes(1);
    expect(listVenuesMock).toHaveBeenCalledTimes(1);
  });

  it("is hidden when the first page is short", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("is busy while loading, keeps focus and ignores a second press", async () => {
    const next = deferred<ReturnType<typeof events>>();
    listEventsMock.mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE)).mockReturnValueOnce(next.promise);
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    const button = screen.getByRole("button", { name: "Load more" });
    button.focus();
    fireEvent.click(button);
    const busy = await screen.findByRole("button", { name: "Loading…" });
    expect(busy).toBe(button);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    expect((busy as HTMLInputElement).disabled).toBe(false);
    expect(document.activeElement).toBe(busy);
    fireEvent.click(busy);
    expect(listEventsMock).toHaveBeenCalledTimes(2);
    await act(async () => next.resolve(events(DISCOVER_PAGE_SIZE, DISCOVER_PAGE_SIZE)));
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE * 2));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Load more" }));
  });

  it("keeps the loaded cards when a page fails and can retry", async () => {
    listEventsMock
      .mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE))
      .mockRejectedValueOnce(new Error("Boom"))
      .mockResolvedValueOnce(events(2, DISCOVER_PAGE_SIZE));
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect((await screen.findByRole("alert")).textContent).toContain("We couldn’t load more events.");
    expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE + 2));
    expect(lastCall()).toMatchObject({ offset: DISCOVER_PAGE_SIZE });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("changing the search", () => {
  it("starts again from the first page", async () => {
    listEventsMock.mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE)).mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE, DISCOVER_PAGE_SIZE));
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE * 2));
    listEventsMock.mockResolvedValue(events(2, 100));
    fireEvent.change(screen.getByRole("textbox", { name: "Search events" }), { target: { value: "rock" } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(lastCall()).toMatchObject({ q: "rock", offset: 0 });
  });

  it("never lets a slow older response replace a newer one", async () => {
    const slow = deferred<ReturnType<typeof events>>();
    listEventsMock.mockReturnValueOnce(slow.promise).mockResolvedValue(events(2, 50));
    renderPage();
    await waitFor(() => expect(listEventsMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole("textbox", { name: "Search events" }), { target: { value: "new" } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    await waitFor(() => expect(cards()).toHaveLength(2));
    await act(async () => slow.resolve(events(7)));
    expect(cards()).toHaveLength(2);
    expect(screen.getByText("Event 50")).toBeTruthy();
  });

  it("drops a load-more response that arrives after the search changed", async () => {
    const late = deferred<ReturnType<typeof events>>();
    listEventsMock.mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE)).mockReturnValueOnce(late.promise).mockResolvedValue(events(2, 80));
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search events" }), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    await waitFor(() => expect(cards()).toHaveLength(2));
    await act(async () => late.resolve(events(5, 200)));
    expect(cards()).toHaveLength(2);
  });
});

describe("Clear filters", () => {
  it("is absent without filters", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("resets the URL from the form", async () => {
    renderPage("/discover?city=Almaty&free=1");
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(url()).toBe("/discover");
    await waitFor(() => expect(lastCall()).toEqual({ limit: DISCOVER_PAGE_SIZE, offset: 0 }));
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("an empty filtered result says nothing matched and offers Clear filters", async () => {
    listEventsMock.mockResolvedValueOnce([]).mockResolvedValue(events(3));
    renderPage("/discover?q=zzz");
    expect(await screen.findByText("No events matched your filters.")).toBeTruthy();
    const empty = document.querySelector(".empty-state") as HTMLElement;
    fireEvent.click(within(empty).getByRole("button", { name: "Clear filters" }));
    expect(url()).toBe("/discover");
    await waitFor(() => expect(cards()).toHaveLength(3));
  });

  it("an empty result without filters keeps the plain message", async () => {
    listEventsMock.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/No events match those filters yet/)).toBeTruthy();
    expect(document.querySelector(".empty-state")!.querySelector("button")).toBeNull();
  });
});

describe("errors", () => {
  it("offers a retry when the first page fails", async () => {
    listEventsMock.mockRejectedValueOnce(new Error("Boom")).mockResolvedValue(events(2));
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toContain("We couldn’t load events.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(cards()).toHaveLength(2));
  });
});
