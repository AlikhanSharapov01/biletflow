import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ActionDialogHost, confirmAction, requestReason } from "./ActionDialog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
    // Like the browser: the autofocus control, else the first focusable one.
    (this.querySelector<HTMLElement>("[autofocus]") ?? this.querySelector<HTMLElement>("button, textarea"))?.focus();
  };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

const dialogElement = () => document.querySelector<HTMLDialogElement>("dialog.action-dialog");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).getAnimations;
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
    await waitFor(() => expect(dialogElement()).toBeNull());
  });

  it("closes the dialog and keeps it in the document until its exit transition ends", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let finishExit!: () => void;
    const finished = new Promise<void>((resolve) => { finishExit = resolve; });
    HTMLDialogElement.prototype.getAnimations = function () { return [{ finished } as unknown as Animation]; };
    render(<ActionDialogHost />);
    let result!: Promise<boolean>;
    act(() => { result = confirmAction("Cancel this event?"); });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    // The caller gets its answer at once; the dialog leaves on its own time.
    expect(await result).toBe(true);
    const leaving = dialogElement();
    expect(leaving).not.toBeNull();
    expect(leaving!.hasAttribute("open")).toBe(false);
    expect(leaving!.hasAttribute("inert")).toBe(true);
    await act(async () => { finishExit(); await finished; });
    expect(dialogElement()).toBeNull();
  });

  it("unmounts after the longest transition when no animation reports its end", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<ActionDialogHost />);
    let result!: Promise<boolean>;
    act(() => { result = confirmAction("Cancel this event?"); });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await result).toBe(false);
    expect(dialogElement()).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(60); });
    expect(dialogElement()).toBeNull();
  });

  it("returns focus to the opener in StrictMode, where effects run twice", async () => {
    // As in a browser, the page behind an open modal dialog is inert: focus cannot move there.
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      const modal = document.querySelector("dialog[open]");
      if (modal && !modal.contains(this)) return;
      focus.call(this, options);
    });
    render(<StrictMode><button>Refund order</button><ActionDialogHost /></StrictMode>);
    const opener = screen.getByRole("button", { name: "Refund order" });
    opener.focus();
    let result!: Promise<boolean>;
    act(() => { result = confirmAction("Refund the whole order?"); });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
    expect(await result).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("opens a second request at once while the first is still leaving", async () => {
    render(<ActionDialogHost />);
    let first!: Promise<boolean>;
    act(() => { first = confirmAction("First action"); });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await first).toBe(true);
    let second!: Promise<boolean>;
    act(() => { second = confirmAction("Second action"); });
    expect(document.querySelectorAll("dialog.action-dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog").hasAttribute("open")).toBe(true);
    expect(screen.getByText("Second action")).toBeTruthy();
    expect(screen.queryByText("First action")).toBeNull();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
    expect(await second).toBe(false);
    await waitFor(() => expect(dialogElement()).toBeNull());
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
