import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
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
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="url">{`${location.pathname}${location.search}`}</output>
      <button type="button" data-testid="back" onClick={() => navigate(-1)} />
      <button type="button" data-testid="forward" onClick={() => navigate(1)} />
    </>
  );
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
const cards = () => document.querySelectorAll(".event-card:not(.skeleton-card)");

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
    const to = screen.getByLabelText("Price to, ₸");
    // What a screen reader would read when the field takes focus.
    let atFocus: Array<string | null | undefined> = [];
    to.addEventListener("focus", () => {
      const id = to.getAttribute("aria-describedby");
      atFocus = [to.getAttribute("aria-invalid"), id && document.getElementById(id)?.textContent];
    });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    expect(atFocus).toEqual(["true", "Minimum price can’t be higher than maximum price."]);
    expect(screen.getByRole("alert").textContent).toBe("Minimum price can’t be higher than maximum price.");
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
    expect((busy as HTMLButtonElement).disabled).toBe(false);
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
    await waitFor(() => expect(document.querySelector(".empty-state")).toBeTruthy());
    const empty = document.querySelector(".empty-state") as HTMLElement;
    expect(empty.textContent).toContain("No events matched your filters.");
    fireEvent.click(within(empty).getByRole("button", { name: "Clear filters" }));
    expect(url()).toBe("/discover");
    await waitFor(() => expect(cards()).toHaveLength(3));
  });

  it("an empty result without filters keeps the plain message", async () => {
    listEventsMock.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(document.querySelector(".empty-state")).toBeTruthy());
    expect(document.querySelector(".empty-state")!.textContent).toMatch(/No events match those filters yet/);
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

const searchBox = () => screen.getByRole("textbox", { name: "Search events" });
const status = () => document.querySelector("[role=status]:not(.loading-state)")!.textContent;

describe("event cards", () => {
  it("has one link per card, named by the event title, and an offer label in the footer", async () => {
    listEventsMock.mockResolvedValue([
      makeEvent({ id: "a", title: "Paid night", price_from_minor: 500_000 }),
      makeEvent({ id: "b", title: "Free night", price_from_minor: 0 }),
      makeEvent({ id: "c", title: "Full night", sold_out: true }),
    ]);
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    for (const [index, title] of ["Paid night", "Free night", "Full night"].entries()) {
      const card = within(cards()[index] as HTMLElement);
      expect(card.getAllByRole("link")).toHaveLength(1);
      expect(card.getByRole("link", { name: title })).toBeTruthy();
      expect(cards()[index]!.classList.contains("event-card-linked")).toBe(true);
    }
    const foot = (index: number) => cards()[index]!.querySelector(".event-card-foot")!;
    expect(foot(0).textContent).toBe("from ₸5,000.00");
    expect(foot(0).querySelector(".event-offer[data-kind=from]")).not.toBeNull();
    expect(foot(1).textContent).toBe("Free");
    expect(foot(1).querySelector(".event-offer[data-kind=free]")).not.toBeNull();
    expect(foot(2).textContent).toBe("Sold out");
    expect(foot(2).querySelector(".event-offer[data-kind=sold_out]")).not.toBeNull();
    expect(screen.queryByText("Tickets available")).toBeNull();
    // The offer is read with the link, which keeps the title as its name.
    expect(screen.getByRole("link", { name: "Full night" }).getAttribute("aria-describedby")).toBe(foot(2).id);
  });
});

describe("keyboard focus", () => {
  it("stays on the Search button after submitting with it", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.change(searchBox(), { target: { value: "jazz" } });
    const button = screen.getByRole("button", { name: "Search events" });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(url()).toBe("/discover?q=jazz"));
    await waitFor(() => expect(lastCall()).toMatchObject({ q: "jazz" }));
    expect(document.activeElement).toBe(button);
  });

  it("stays in the search box after Enter, with its text", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    const box = searchBox() as HTMLInputElement;
    box.focus();
    fireEvent.change(box, { target: { value: "jazz" } });
    fireEvent.submit(box.form!);
    await waitFor(() => expect(url()).toBe("/discover?q=jazz"));
    await waitFor(() => expect(lastCall()).toMatchObject({ q: "jazz" }));
    expect(document.activeElement).toBe(searchBox());
    expect((searchBox() as HTMLInputElement).value).toBe("jazz");
  });

  it("moves to the search box after Clear filters in the form", async () => {
    renderPage("/discover?q=jazz&city=Almaty");
    await waitFor(() => expect(cards()).toHaveLength(3));
    const clear = screen.getByRole("button", { name: "Clear filters" });
    clear.focus();
    fireEvent.click(clear);
    await waitFor(() => expect(url()).toBe("/discover"));
    expect(document.activeElement).toBe(searchBox());
    expect((searchBox() as HTMLInputElement).value).toBe("");
  });

  it("moves to the search box after Clear filters in the empty state", async () => {
    listEventsMock.mockResolvedValueOnce([]).mockResolvedValue(events(3));
    renderPage("/discover?q=zzz");
    await waitFor(() => expect(document.querySelector(".empty-state button")).toBeTruthy());
    const clear = document.querySelector(".empty-state button") as HTMLButtonElement;
    clear.focus();
    fireEvent.click(clear);
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(document.activeElement).toBe(searchBox());
  });

  it("follows the new cards when the last page hides Load more", async () => {
    listEventsMock.mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE)).mockResolvedValueOnce(events(3, DISCOVER_PAGE_SIZE));
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    const button = screen.getByRole("button", { name: "Load more" });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE + 3));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
    const active = document.activeElement as HTMLAnchorElement;
    expect(active.getAttribute("href")).toBe(`/events/e${DISCOVER_PAGE_SIZE}`);
    expect(active.closest("h3")).not.toBeNull();
  });

  it("does not move the focus when Load more was not focused", async () => {
    listEventsMock.mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE)).mockResolvedValueOnce(events(3, DISCOVER_PAGE_SIZE));
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    searchBox().focus();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE + 3));
    expect(document.activeElement).toBe(searchBox());
  });

  it("puts Search and Clear before More filters, matching the visual order", async () => {
    renderPage("/discover?city=Almaty");
    const actions = document.querySelector(".filter-actions")!;
    const details = document.querySelector("details")!;
    expect(actions.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("More filters summary", () => {
  it("has a decorative chevron", () => {
    renderPage();
    const chevron = document.querySelector("summary svg")!;
    expect(chevron.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("history", () => {
  it("Back and Forward restore the form", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.change(searchBox(), { target: { value: "jazz" } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    await waitFor(() => expect(url()).toBe("/discover?q=jazz"));
    fireEvent.click(screen.getByTestId("back"));
    await waitFor(() => expect(url()).toBe("/discover"));
    expect((searchBox() as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByTestId("forward"));
    await waitFor(() => expect(url()).toBe("/discover?q=jazz"));
    expect((searchBox() as HTMLInputElement).value).toBe("jazz");
  });

  it("Back after Clear filters restores the search the user cleared", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.change(searchBox(), { target: { value: "jazz" } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    await waitFor(() => expect(url()).toBe("/discover?q=jazz"));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(url()).toBe("/discover"));
    fireEvent.click(screen.getByTestId("back"));
    await waitFor(() => expect(url()).toBe("/discover?q=jazz"));
    expect((searchBox() as HTMLInputElement).value).toBe("jazz");
  });

  it("searching again with the same filters reloads without a history entry", async () => {
    renderPage("/discover?q=jazz");
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    await waitFor(() => expect(listEventsMock).toHaveBeenCalledTimes(2));
    expect(url()).toBe("/discover?q=jazz");
    fireEvent.click(screen.getByTestId("back"));
    // The only entry is the initial one, so Back goes nowhere.
    expect(url()).toBe("/discover?q=jazz");
  });
});

describe("paging details", () => {
  it("asks for the next page by rows received, not by cards shown", async () => {
    const first = events(DISCOVER_PAGE_SIZE);
    // The second page repeats the last card of the first one.
    const second = [first[DISCOVER_PAGE_SIZE - 1]!, ...events(DISCOVER_PAGE_SIZE - 1, DISCOVER_PAGE_SIZE)];
    listEventsMock.mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce([]);
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE * 2 - 1));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(listEventsMock).toHaveBeenCalledTimes(3));
    expect(lastCall()).toMatchObject({ offset: DISCOVER_PAGE_SIZE * 2 });
  });

  it("keeps the first page's date window when the clock moves on", async () => {
    listEventsMock.mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE)).mockResolvedValueOnce(events(1, DISCOVER_PAGE_SIZE));
    renderPage("/discover?when=today");
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    const firstWindow = { date_from: lastCall().date_from, date_to: lastCall().date_to };
    vi.setSystemTime(new Date(2026, 5, 12, 9));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(listEventsMock).toHaveBeenCalledTimes(2));
    expect({ date_from: lastCall().date_from, date_to: lastCall().date_to }).toEqual(firstWindow);
  });

  it("reads a price typed with an exponent as whole tenge", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.change(screen.getByLabelText("Price from, ₸"), { target: { value: "1e3" } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    await waitFor(() => expect(url()).toBe("/discover?min_price=1000"));
  });
});

describe("announcements", () => {
  it("one status region reports the count, then what an empty search found", async () => {
    listEventsMock.mockResolvedValueOnce(events(3)).mockResolvedValueOnce([]);
    renderPage();
    await waitFor(() => expect(status()).toBe("Events shown: 3"));
    fireEvent.change(searchBox(), { target: { value: "zzz" } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    await waitFor(() => expect(status()).toBe("No events matched your filters."));
  });
});

describe("coming back to a search", () => {
  const search = (text: string) => {
    fireEvent.change(searchBox(), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
  };
  const back = () => fireEvent.click(screen.getByTestId("back"));

  it("is not left busy by a Load more that was still running", async () => {
    const late = deferred<ReturnType<typeof events>>();
    listEventsMock
      .mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE))
      .mockReturnValueOnce(late.promise)
      .mockResolvedValueOnce(events(3, 100))
      .mockResolvedValue(events(DISCOVER_PAGE_SIZE));
    renderPage("/discover?q=a");
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    search("jazz");
    await waitFor(() => expect(cards()).toHaveLength(3));
    await act(async () => late.resolve(events(DISCOVER_PAGE_SIZE, 300)));
    back();
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    const button = screen.getByRole("button", { name: "Load more" });
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(lastCall()).toMatchObject({ q: "a", offset: DISCOVER_PAGE_SIZE }));
  });

  it("does not bring back an old Load more error", async () => {
    listEventsMock
      .mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE))
      .mockRejectedValueOnce(new Error("Boom"))
      .mockResolvedValueOnce(events(3, 100))
      .mockResolvedValue(events(DISCOVER_PAGE_SIZE));
    renderPage("/discover?q=a");
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("alert");
    search("jazz");
    await waitFor(() => expect(cards()).toHaveLength(3));
    back();
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("starts again from the first page, without the pages loaded before", async () => {
    listEventsMock
      .mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE))
      .mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE, DISCOVER_PAGE_SIZE))
      .mockResolvedValueOnce(events(3, 100))
      .mockResolvedValue(events(DISCOVER_PAGE_SIZE));
    renderPage("/discover?q=a");
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE * 2));
    search("jazz");
    await waitFor(() => expect(cards()).toHaveLength(3));
    back();
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
  });
});

describe("repeating a search", () => {
  it("uses the current day's window when it is repeated the next day", async () => {
    renderPage("/discover?when=today");
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(lastCall()).toMatchObject(dateRange("today", NOW));
    const tomorrow = new Date(2026, 5, 11, 9);
    vi.setSystemTime(tomorrow);
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    await waitFor(() => expect(listEventsMock).toHaveBeenCalledTimes(2));
    expect(lastCall()).toMatchObject(dateRange("today", tomorrow));
  });
});

describe("malformed prices", () => {
  it("shows an inline error on the field, focuses it and sends nothing", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    listEventsMock.mockClear();
    const form = screen.getByRole("button", { name: "Search events" }).closest("form")!;
    expect(form.noValidate).toBe(true);
    const from = screen.getByLabelText("Price from, ₸");
    fireEvent.change(from, { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    expect(from.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(from);
    expect(screen.getByRole("alert").textContent).toBe("Enter a whole amount in tenge.");
    expect(url()).toBe("/discover");
    expect(listEventsMock).not.toHaveBeenCalled();
  });

  it("opens More filters on a phone when the bad price is inside it", async () => {
    setPhone(true);
    renderPage();
    const details = document.querySelector("details")!;
    expect(details.hasAttribute("open")).toBe(false);
    fireEvent.change(screen.getByLabelText("Price to, ₸"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    expect(details.hasAttribute("open")).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Price to, ₸"));
  });
});

describe("loading", () => {
  const grid = () => document.querySelector<HTMLElement>(".event-grid")!;

  it("shows skeleton cards in one status region, then the real cards", async () => {
    const first = deferred<ReturnType<typeof events>>();
    listEventsMock.mockReturnValue(first.promise);
    renderPage();
    const label = await screen.findByText("Loading events…");
    expect(label.closest("[role=status]")!.querySelectorAll(".skeleton-card")).toHaveLength(6);
    expect(document.querySelectorAll(".skeleton-card")).toHaveLength(6);
    expect(cards()).toHaveLength(0);
    await act(async () => first.resolve(events(3)));
    expect(cards()).toHaveLength(3);
    expect(document.querySelector(".skeleton-card")).toBeNull();
  });

  it("keeps every loaded card, dimmed and busy, while a new search loads, then swaps in the new ones", async () => {
    const next = deferred<ReturnType<typeof events>>();
    listEventsMock
      .mockResolvedValueOnce(events(DISCOVER_PAGE_SIZE))
      .mockResolvedValueOnce(events(2, 100))
      .mockReturnValueOnce(next.promise);
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE + 2));
    expect(grid().getAttribute("aria-busy")).toBeNull();

    fireEvent.change(searchBox(), { target: { value: "jazz" } });
    fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    await waitFor(() => expect(grid().getAttribute("aria-busy")).toBe("true"));
    expect(cards()).toHaveLength(DISCOVER_PAGE_SIZE + 2);
    expect(document.querySelector(".skeleton-card")).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(status()).toBe("Loading events…");

    await act(async () => next.resolve(events(1, 500)));
    expect(cards()).toHaveLength(1);
    expect(grid().getAttribute("aria-busy")).toBeNull();
    expect(status()).toBe("Events shown: 1");
  });

  it("ignores a late answer to the previous search while the dimmed cards stay", async () => {
    const jazz = deferred<ReturnType<typeof events>>();
    const rock = deferred<ReturnType<typeof events>>();
    listEventsMock.mockResolvedValueOnce(events(3)).mockReturnValueOnce(jazz.promise).mockReturnValueOnce(rock.promise);
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    const search = (text: string) => {
      fireEvent.change(searchBox(), { target: { value: text } });
      fireEvent.click(screen.getByRole("button", { name: "Search events" }));
    };
    search("jazz");
    await waitFor(() => expect(listEventsMock).toHaveBeenCalledTimes(2));
    search("rock");
    await waitFor(() => expect(listEventsMock).toHaveBeenCalledTimes(3));
    await act(async () => jazz.resolve(events(5, 200)));
    expect(cards()).toHaveLength(3);
    expect(grid().getAttribute("aria-busy")).toBe("true");
    await act(async () => rock.resolve(events(2, 300)));
    expect(cards()).toHaveLength(2);
  });
});
