import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { ActionDialogHost, confirmAction, requestReason } from "./ActionDialog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
    this.querySelector<HTMLButtonElement>('[autofocus]')?.focus();
  };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

describe("action dialogs", () => {
  it("labels the destructive action and returns focus to its opener", async () => {
    render(<><button>Delete ticket</button><ActionDialogHost /></>);
    const opener = screen.getByRole("button", { name: "Delete ticket" });
    opener.focus();
    let result!: Promise<boolean>;
    act(() => { result = confirmAction("Cancel this ticket?"); });
    expect(screen.getByRole("dialog", { name: "Confirm action" }).getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await result).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("Escape cancels without confirming", async () => {
    render(<ActionDialogHost />);
    let result!: Promise<boolean>;
    act(() => { result = confirmAction("Cancel this event?"); });
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
    expect(await result).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("requires a nonblank reason and returns the trimmed value", async () => {
    render(<ActionDialogHost />);
    let result!: Promise<string | null>;
    act(() => { result = requestReason("Refund the whole order?"); });
    const confirm = screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const input = screen.getByRole("textbox", { name: "Reason (shown in the activity history)" });
    fireEvent.change(input, { target: { value: "   " } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(input, { target: { value: " Duplicate registration " } });
    fireEvent.click(confirm);
    expect(await result).toBe("Duplicate registration");
  });

  it("does not replace an outstanding action and resolves cancellation on unmount", async () => {
    const { unmount } = render(<ActionDialogHost />);
    let first!: Promise<boolean>;
    act(() => { first = confirmAction("First action"); });
    expect(await confirmAction("Second action")).toBe(false);
    expect(screen.getByText("First action")).toBeTruthy();
    unmount();
    expect(await first).toBe(false);
  });
});
