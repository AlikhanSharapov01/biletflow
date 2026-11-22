import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { makeEvent } from "../../../tests/helpers/fixtures";
import { WorkspaceEventCard } from "../../features/organizer/workspace/WorkspaceEventCard";
import { EventCard } from "./EventCard";

const inRouter = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe("EventCard", () => {
  it("covers the card with its title link only when asked to", () => {
    inRouter(
      <>
        <EventCard title="Plain" to="/a" footer={<span>x</span>} />
        <EventCard title="Covered" to="/b" coverLink footer={<span>y</span>} />
      </>,
    );
    const [plain, covered] = screen.getAllByRole("article");
    expect(plain!.classList.contains("event-card-linked")).toBe(false);
    expect(covered!.classList.contains("event-card-linked")).toBe(true);
  });

  it("never covers a card that has extra content", () => {
    inRouter(<EventCard title="With form" to="/c" coverLink><button type="button">Go</button></EventCard>);
    expect(screen.getByRole("article").classList.contains("event-card-linked")).toBe(false);
  });
});

describe("WorkspaceEventCard", () => {
  it("keeps its own controls clickable next to the title link", () => {
    const onDuplicate = vi.fn();
    const onTogglePublish = vi.fn();
    inRouter(<WorkspaceEventCard event={makeEvent({ title: "Gala" })} venue={undefined} busy={false} onTogglePublish={onTogglePublish} onDuplicate={onDuplicate} />);
    const card = screen.getByRole("article");
    expect(card.classList.contains("event-card-linked")).toBe(false);
    const view = within(card);
    expect(view.getByRole("link", { name: "Gala" })).toBeTruthy();
    expect(view.getByRole("link", { name: "Manage" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Unpublish" }));
    fireEvent.click(view.getByRole("button", { name: "Duplicate" }));
    expect(onTogglePublish).toHaveBeenCalledTimes(1);
    expect(onDuplicate).toHaveBeenCalledTimes(1);
  });
});
