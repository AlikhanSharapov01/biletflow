import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeTicketType } from "../../../../../tests/helpers/fixtures";
import { CampaignForm } from "./CampaignForm";

function mount(busy = false, onSubmit = vi.fn().mockResolvedValue(true)) {
  const props = { types: [makeTicketType()], submitLabel: "Create campaign", busy, message: "", onSubmit, onInvalid: vi.fn() };
  const view = render(<CampaignForm {...props} />);
  return { ...view, props, onSubmit };
}

function fill() {
  fireEvent.change(screen.getByLabelText(/Campaign name/), { target: { value: "Spring" } });
  fireEvent.change(screen.getByLabelText("Percent"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2030-01-01T10:00" } });
  fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2030-02-01T10:00" } });
}

describe("CampaignForm", () => {
  it("groups the discount, schedule and limit fields", () => {
    mount();
    for (const name of ["Discount", "Schedule", "Limits and code"]) {
      expect(screen.getByRole("group", { name })).toBeTruthy();
    }
    expect(screen.getByRole("group", { name: "Schedule" }).contains(screen.getByLabelText("Starts"))).toBe(true);
  });

  it("keeps the focused field focused and read-only, not disabled, while the request runs", () => {
    const { props, rerender, container, onSubmit } = mount();
    fill();
    const value = screen.getByLabelText("Percent") as HTMLInputElement;
    value.focus();
    rerender(<CampaignForm {...props} busy />);
    expect(container.querySelector("form")!.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(value);
    expect(value.readOnly).toBe(true);
    expect(value.disabled).toBe(false);
    // Enter in a field clicks the submit button, which ignores activation while busy.
    fireEvent.click(screen.getByRole("button", { name: "Create campaign" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(value);
  });

  it("ignores select and checkbox changes while busy", () => {
    const { props, rerender } = mount(true);
    rerender(<CampaignForm {...props} busy />);
    const kind = screen.getByLabelText("Discount", { selector: "select" }) as HTMLSelectElement;
    fireEvent.change(kind, { target: { value: "fixed" } });
    expect(kind.value).toBe("percent");
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(false);
  });

  it("disables everything when the form is not editable", () => {
    const view = render(<CampaignForm types={[]} submitLabel="Save" disabled busy={false} message="" onSubmit={vi.fn()} onInvalid={vi.fn()} />);
    expect((screen.getByLabelText("Percent") as HTMLInputElement).matches(":disabled")).toBe(true);
    view.unmount();
  });
});
