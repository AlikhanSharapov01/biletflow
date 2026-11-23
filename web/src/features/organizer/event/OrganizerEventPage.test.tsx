import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEvent, listCategories, listVenues } from "../../../api/catalog";
import { duplicateEvent } from "../../../api/eventAdmin";
import { makeEvent } from "../../../../tests/helpers/fixtures";
import { OrganizerEventPage } from "./OrganizerEventPage";

vi.mock("../../../api/catalog", () => ({ getEvent: vi.fn(), listCategories: vi.fn(), listVenues: vi.fn() }));
vi.mock("../../../api/eventAdmin", () => ({ cancelEvent: vi.fn(), duplicateEvent: vi.fn(), publishEvent: vi.fn(), unpublishEvent: vi.fn() }));
vi.mock("./AnalyticsTab", () => ({ AnalyticsTab: () => <p>analytics body</p> }));
vi.mock("./AttendeesTab", () => ({ AttendeesTab: () => <p>attendees body</p> }));
vi.mock("./CampaignsTab", () => ({ CampaignsTab: () => <p>campaigns body</p> }));
vi.mock("./CheckInsTab", () => ({ CheckInsTab: () => <p>check-ins body</p> }));
vi.mock("./DetailsTab", () => ({ DetailsTab: () => <p>details body</p> }));
vi.mock("./FinanceTab", () => ({ FinanceTab: () => <p>finance body</p> }));
vi.mock("./HistoryTab", () => ({ HistoryTab: () => <p>history body</p> }));
vi.mock("./PaidSalesTab", () => ({ PaidSalesTab: () => <p>paid-sales body</p> }));
vi.mock("./SeatingTab", () => ({ SeatingTab: () => <p>seating body</p> }));
vi.mock("./StaffTab", () => ({ StaffTab: () => <p>staff body</p> }));
vi.mock("./TicketTypesTab", () => ({ TicketTypesTab: () => <p>tickets body</p> }));
vi.mock("../../../components/ui/ActionDialog", () => ({ confirmAction: vi.fn() }));

beforeEach(() => {
  vi.mocked(getEvent).mockResolvedValue(makeEvent());
  vi.mocked(listCategories).mockResolvedValue([]);
  vi.mocked(listVenues).mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="url">{location.pathname + location.search}</output>
      <button type="button" onClick={() => navigate(-1)}>Back</button>
    </>
  );
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={["/start", url]} initialIndex={1}>
      <Routes>
        <Route path="/start" element={<p>start page</p>} />
        <Route path="/organizer/events/:eventId" element={<OrganizerEventPage />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

const url = () => screen.getByTestId("url").textContent;
const groups = () => screen.getByRole("tablist", { name: "Event stages" });
const sections = () => screen.getByRole("tablist", { name: "Event sections" });

describe("organizer event page tabs", () => {
  it("opens Results > Finance for ?tab=finance", async () => {
    renderAt("/organizer/events/e1?tab=finance");
    await screen.findByText("finance body");
    expect(within(groups()).getByRole("tab", { name: "Results" }).getAttribute("aria-selected")).toBe("true");
    expect(within(sections()).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Analytics", "Finance", "History"]);
    expect(within(sections()).getByRole("tab", { name: "Finance" }).getAttribute("aria-selected")).toBe("true");
  });

  it("rewrites ?tab= when a section is clicked, keeping other params and not adding history", async () => {
    renderAt("/organizer/events/e1?tab=finance&x=1");
    await screen.findByText("finance body");
    fireEvent.click(within(sections()).getByRole("tab", { name: "History" }));
    expect(await screen.findByText("history body")).toBeTruthy();
    expect(url()).toBe("/organizer/events/e1?tab=history&x=1");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("start page")).toBeTruthy();
    expect(url()).toBe("/start");
  });

  it("shows details and normalises the URL for a missing or unknown tab", async () => {
    renderAt("/organizer/events/e1?tab=nope&x=1");
    await screen.findByText("details body");
    await waitFor(() => expect(url()).toBe("/organizer/events/e1?tab=details&x=1"));
    expect(within(groups()).getByRole("tab", { name: "Setup" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("start page")).toBeTruthy();
  });

  it("normalises a URL without a tab", async () => {
    renderAt("/organizer/events/e1");
    await screen.findByText("details body");
    await waitFor(() => expect(url()).toBe("/organizer/events/e1?tab=details"));
  });

  it("selects the first section of a clicked group", async () => {
    renderAt("/organizer/events/e1?tab=details");
    await screen.findByText("details body");
    fireEvent.click(within(groups()).getByRole("tab", { name: "Event day" }));
    expect(await screen.findByText("attendees body")).toBeTruthy();
    expect(url()).toBe("/organizer/events/e1?tab=attendees");
    fireEvent.click(within(groups()).getByRole("tab", { name: "Sales" }));
    expect(await screen.findByText("paid-sales body")).toBeTruthy();
    expect(url()).toBe("/organizer/events/e1?tab=paid-sales");
  });

  it("keeps the section when the current group is chosen again", async () => {
    renderAt("/organizer/events/e1?tab=finance");
    await screen.findByText("finance body");
    fireEvent.click(within(groups()).getByRole("tab", { name: "Results" }));
    fireEvent.click(within(groups()).getByRole("tab", { name: "Results" }));
    expect(url()).toBe("/organizer/events/e1?tab=finance");
    expect(screen.getByText("finance body")).toBeTruthy();
    fireEvent.keyDown(within(groups()).getByRole("tab", { name: "Results" }), { key: "Home" });
    expect(await screen.findByText("details body")).toBeTruthy();
    fireEvent.click(within(sections()).getByRole("tab", { name: "Staff" }));
    fireEvent.keyDown(within(groups()).getByRole("tab", { name: "Setup" }), { key: "Home" });
    expect(url()).toBe("/organizer/events/e1?tab=staff");
  });

  it("goes back to Setup > Details after duplicating", async () => {
    vi.mocked(duplicateEvent).mockResolvedValue(makeEvent({ id: "copy" }));
    renderAt("/organizer/events/e1?tab=finance");
    await screen.findByText("finance body");
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(url()).toBe("/organizer/events/copy?tab=details"));
    expect(await screen.findByText("details body")).toBeTruthy();
    expect(within(groups()).getByRole("tab", { name: "Setup" }).getAttribute("aria-selected")).toBe("true");
  });

  it("supports arrow, Home and End keys in both rows", async () => {
    renderAt("/organizer/events/e1?tab=tickets");
    await screen.findByText("tickets body");
    const section = (name: string) => within(sections()).getByRole("tab", { name });
    const group = (name: string) => within(groups()).getByRole("tab", { name });
    fireEvent.keyDown(section("Ticket types"), { key: "ArrowRight" });
    expect(await screen.findByText("seating body")).toBeTruthy();
    expect(document.activeElement).toBe(section("Seating"));
    fireEvent.keyDown(section("Seating"), { key: "End" });
    expect(await screen.findByText("staff body")).toBeTruthy();
    expect(document.activeElement).toBe(section("Staff"));
    fireEvent.keyDown(section("Staff"), { key: "ArrowRight" });
    expect(await screen.findByText("details body")).toBeTruthy();
    expect(document.activeElement).toBe(section("Details"));
    fireEvent.keyDown(section("Details"), { key: "ArrowLeft" });
    expect(await screen.findByText("staff body")).toBeTruthy();
    fireEvent.keyDown(section("Staff"), { key: "Home" });
    expect(await screen.findByText("details body")).toBeTruthy();
    expect(document.activeElement).toBe(section("Details"));
    expect(url()).toBe("/organizer/events/e1?tab=details");

    fireEvent.keyDown(group("Setup"), { key: "ArrowRight" });
    expect(await screen.findByText("paid-sales body")).toBeTruthy();
    expect(document.activeElement).toBe(group("Sales"));
    fireEvent.keyDown(group("Sales"), { key: "End" });
    expect(await screen.findByText("analytics body")).toBeTruthy();
    expect(document.activeElement).toBe(group("Results"));
    fireEvent.keyDown(group("Results"), { key: "Home" });
    expect(await screen.findByText("details body")).toBeTruthy();
    fireEvent.keyDown(group("Setup"), { key: "ArrowLeft" });
    expect(await screen.findByText("analytics body")).toBeTruthy();
    expect(url()).toBe("/organizer/events/e1?tab=analytics");
  });
});
