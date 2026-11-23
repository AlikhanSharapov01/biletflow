import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { previewPromo } from "../../../api/promo";
import type { PromoPreview } from "../../../api/types/promo";
import { PromoCodeField } from "./PromoCodeField";

vi.mock("../../../api/promo", () => ({ previewPromo: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const preview: PromoPreview = {
  event_id: "e1", code: "SPRING", discount_kind: "percent", discount_value: 10, eligible_ticket_type_ids: [], valid_until: "2099-01-01T00:00:00Z",
};

function Harness() {
  const [applied, setApplied] = useState<PromoPreview | null>(null);
  return <PromoCodeField eventId="e1" initialCode="" applied={applied} onApplied={setApplied} />;
}

describe("PromoCodeField focus", () => {
  it("keeps focus on the input after Enter applies the code", async () => {
    vi.mocked(previewPromo).mockResolvedValue(preview);
    render(<Harness />);
    const input = screen.getByLabelText(/Promo code/) as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "spring" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByRole("button", { name: "Remove" });
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("focuses the input after Remove and lets the buyer type again", async () => {
    vi.mocked(previewPromo).mockResolvedValue(preview);
    render(<Harness />);
    const input = screen.getByLabelText(/Promo code/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "spring" } });
    fireEvent.submit(input.closest("form")!);
    const remove = await screen.findByRole("button", { name: "Remove" });
    remove.focus();
    fireEvent.click(remove);
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.readOnly).toBe(false);
    expect(input.value).toBe("");
  });

  it("keeps the applied discount when Enter is pressed again", async () => {
    vi.mocked(previewPromo).mockResolvedValueOnce(preview).mockRejectedValue(new Error("Code expired"));
    const onApplied = vi.fn();
    function Spy() {
      const [applied, setApplied] = useState<PromoPreview | null>(null);
      return <PromoCodeField eventId="e1" initialCode="" applied={applied} onApplied={(next) => { onApplied(next); setApplied(next); }} />;
    }
    render(<Spy />);
    const input = screen.getByLabelText(/Promo code/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "spring" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByRole("button", { name: "Remove" });
    fireEvent.submit(input.closest("form")!);
    await Promise.resolve();
    expect(previewPromo).toHaveBeenCalledTimes(1);
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(onApplied).toHaveBeenLastCalledWith(preview);
  });
});
