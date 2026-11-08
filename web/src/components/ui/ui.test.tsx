import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorPanel, FormMessage, Loading } from "./Feedback";
import { NotAvailableYet } from "./NotAvailableYet";
import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
  it("renders its label with the tone as a class, positive by default", () => {
    const { rerender } = render(<StatusPill>Valid</StatusPill>);
    expect(screen.getByText("Valid").className).toBe("status positive");
    rerender(<StatusPill tone="blocked">Refunded</StatusPill>);
    expect(screen.getByText("Refunded").className).toBe("status blocked");
  });
});

describe("NotAvailableYet", () => {
  it("states the feature is coming without inventing data", () => {
    render(<NotAvailableYet feature="Promo campaigns" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Not available yet");
    expect(status.textContent).toContain("Promo campaigns is coming soon.");
    expect(status.textContent).toContain("will start working once the server side is released");
  });

  it("uses a custom explanation when given", () => {
    render(<NotAvailableYet feature="Refunds">Ask the organizer directly for now.</NotAvailableYet>);
    expect(screen.getByText("Ask the organizer directly for now.")).toBeTruthy();
    expect(screen.queryByText(/server side is released/)).toBeNull();
  });
});

describe("feedback states", () => {
  it("announces loading with a default label", () => {
    const { rerender } = render(<Loading />);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    rerender(<Loading label="Loading orders…" />);
    expect(screen.getByRole("status").textContent).toBe("Loading orders…");
  });

  it("shows an error as an alert with an optional retry", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorPanel title="We couldn’t load your orders." message="Offline" onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("We couldn’t load your orders.");
    expect(alert.textContent).toContain("Offline");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<ErrorPanel title="Broken" message="x" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders empty states and form messages", () => {
    render(
      <>
        <EmptyState wide>Nothing here</EmptyState>
        <FormMessage message="Saved." success />
      </>,
    );
    expect(screen.getByText("Nothing here").className).toContain("empty-wide");
    const message = screen.getByRole("status");
    expect(message.textContent).toBe("Saved.");
    expect(message.className).toContain("success");
  });
});
