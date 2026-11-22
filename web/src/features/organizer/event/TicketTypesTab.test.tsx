import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listTicketTypes } from "../../../api/catalog";
import { createTicketType, updateTicketType } from "../../../api/eventAdmin";
import { makeEvent, makeTicketType } from "../../../../tests/helpers/fixtures";
import { TicketTypesTab } from "./TicketTypesTab";

vi.mock("../../../api/catalog", () => ({ listTicketTypes: vi.fn() }));
vi.mock("../../../api/eventAdmin", () => ({ createTicketType: vi.fn(), updateTicketType: vi.fn() }));

beforeEach(() => vi.mocked(listTicketTypes).mockResolvedValue([makeTicketType({ id: "t1", name: "General" })]));
afterEach(() => vi.resetAllMocks());

async function openEditor() {
  render(<TicketTypesTab event={makeEvent({ capacity: 100 })} />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  const forms = document.querySelectorAll("form");
  return { edit: within(forms[0] as HTMLElement), create: within(forms[1] as HTMLElement) };
}

describe("ticket types busy rule", () => {
  it("marks only the saving edit form busy and locks the create form", async () => {
    vi.mocked(updateTicketType).mockReturnValue(new Promise(() => {}) as ReturnType<typeof updateTicketType>);
    const { edit, create } = await openEditor();
    fireEvent.click(edit.getByRole("button", { name: "Save ticket type" }));
    await waitFor(() => expect(edit.getByRole("button", { name: "Save ticket type" }).getAttribute("aria-busy")).toBe("true"));
    const add = create.getByRole("button", { name: "Add ticket type" });
    expect(add.hasAttribute("aria-busy")).toBe(false);
    expect(add.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(add);
    expect(createTicketType).not.toHaveBeenCalled();
    expect(updateTicketType).toHaveBeenCalledTimes(1);
  });

  it("marks only the create form busy and locks the edit form's save", async () => {
    vi.mocked(createTicketType).mockReturnValue(new Promise(() => {}) as ReturnType<typeof createTicketType>);
    const { edit, create } = await openEditor();
    fireEvent.change(create.getByLabelText(/Name/), { target: { value: "VIP" } });
    fireEvent.change(create.getByLabelText(/Quantity/), { target: { value: "10" } });
    fireEvent.click(create.getByRole("button", { name: "Add ticket type" }));
    await waitFor(() => expect(create.getByRole("button", { name: "Add ticket type" }).getAttribute("aria-busy")).toBe("true"));
    const save = edit.getByRole("button", { name: "Save ticket type" });
    expect(save.hasAttribute("aria-busy")).toBe(false);
    expect(save.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(save);
    expect(updateTicketType).not.toHaveBeenCalled();
  });
});
