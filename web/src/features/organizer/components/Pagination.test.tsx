import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

function button(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("Pagination", () => {
  it("shows the visible range and moves between pages", () => {
    const onChange = vi.fn();
    render(<Pagination total={230} limit={50} offset={50} shown={50} onChange={onChange} label="Check-in pages" />);
    expect(screen.getByRole("navigation", { name: "Check-in pages" })).toBeTruthy();
    expect(screen.getByText("51–100 of 230")).toBeTruthy();

    fireEvent.click(button("Previous"));
    fireEvent.click(button("Next"));
    expect(onChange.mock.calls).toEqual([[0], [100]]);
  });

  it("disables Previous on the first page and Next on the last", () => {
    const { rerender } = render(<Pagination total={120} limit={50} offset={0} shown={50} onChange={vi.fn()} />);
    expect(button("Previous").disabled).toBe(true);
    expect(button("Next").disabled).toBe(false);

    rerender(<Pagination total={120} limit={50} offset={100} shown={20} onChange={vi.fn()} />);
    expect(screen.getByText("101–120 of 120")).toBeTruthy();
    expect(button("Previous").disabled).toBe(false);
    expect(button("Next").disabled).toBe(true);
  });

  it("says an empty page past the end is empty, and Previous goes back to rows", () => {
    const onChange = vi.fn();
    render(<Pagination total={10} limit={50} offset={50} shown={0} onChange={onChange} />);
    expect(screen.getByText("No results on this page (10 total)")).toBeTruthy();
    expect(screen.queryByText(/0–0/)).toBeNull();
    expect(button("Previous").disabled).toBe(false);
    expect(button("Next").disabled).toBe(true);
    fireEvent.click(button("Previous"));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("sends Previous from far past the end to the last page with rows", () => {
    const onChange = vi.fn();
    render(<Pagination total={230} limit={50} offset={400} shown={0} onChange={onChange} />);
    expect(screen.getByText("No results on this page (230 total)")).toBeTruthy();
    fireEvent.click(button("Previous"));
    expect(onChange).toHaveBeenCalledWith(200);
  });

  it("says when there are no results", () => {
    render(<Pagination total={0} limit={50} offset={0} shown={0} onChange={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeTruthy();
    expect(screen.getByText("No results")).toBeTruthy();
    expect(button("Previous").disabled).toBe(true);
    expect(button("Next").disabled).toBe(true);
  });
});
