import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeImage } from "../../../../../tests/helpers/fixtures";
import { ImageRow } from "./ImageRow";

function row(first: boolean, onUp = vi.fn()) {
  const props = { image: makeImage(), last: false, pending: null, locked: false, onDown: vi.fn(), onCover: vi.fn(), onDelete: vi.fn() };
  return { ...render(<ul><ImageRow {...props} first={first} onUp={onUp} /></ul>), props: { ...props, onUp } };
}

describe("ImageRow", () => {
  it("keeps focus on the up arrow when the image reaches the top, and ignores it there", () => {
    const onUp = vi.fn();
    const view = row(false, onUp);
    const up = screen.getByRole("button", { name: "Move “Main stage” earlier" });
    up.focus();
    fireEvent.click(up);
    expect(onUp).toHaveBeenCalledTimes(1);
    view.rerender(<ul><ImageRow {...view.props} first onUp={onUp} /></ul>);
    expect(document.activeElement).toBe(up);
    expect(up.getAttribute("aria-disabled")).toBe("true");
    expect((up as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(up);
    expect(onUp).toHaveBeenCalledTimes(1);
  });
});
