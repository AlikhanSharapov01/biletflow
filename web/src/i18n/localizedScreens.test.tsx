import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeEvent, makeTicketType } from "../../tests/helpers/fixtures";
import { TicketSelector } from "../features/checkout/components/TicketSelector";
import { AnalyticsFilterBar } from "../features/organizer/event/analytics/AnalyticsFilterBar";
import { FormMessage } from "../components/ui/Feedback";
import { failureMessage } from "../api/errors";
import { quantityLabel, setLocale, t } from "./index";
import { statusLabel } from "../utils/format";
import type { Quantities } from "../features/checkout/utils/checkout";

afterEach(() => setLocale("en"));

describe("localized screens and backend codes", () => {
  it.each(["ru", "kk"] as const)("switches checkout to %s with correct plural counts and unchanged ticket IDs", (locale) => {
    setLocale(locale);
    const reserve = vi.fn();
    function Checkout() {
      const [quantities, setQuantities] = useState<Quantities>({ "original-ticket-id": 2 });
      return <TicketSelector event={makeEvent()} tickets={[makeTicketType({ id: "original-ticket-id" })]}
        quantities={quantities} setQuantities={setQuantities} busy={false} message="" promo={null} onReserve={reserve} />;
    }
    render(<Checkout />);
    const label = t("checkout.reserve_count", { items: quantityLabel("ticket", 2) });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Tickets are held/)).toBeNull();
    act(() => setLocale(locale === "ru" ? "kk" : "ru"));
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("2");
    expect(screen.getByRole("button", { name: t("checkout.reserve_count", { items: quantityLabel("ticket", 2) }) })).toBeTruthy();
  });

  it.each(["ru", "kk"] as const)("keeps analytics API filter values in English when the interface is %s", (locale) => {
    setLocale(locale);
    const apply = vi.fn();
    render(<AnalyticsFilterBar types={[]} campaigns={[]} bucket="day" onApply={apply} />);
    const group = screen.getByRole("combobox", { name: t("org.group_by") });
    expect((group as HTMLSelectElement).value).toBe("day");
    expect((screen.getByRole("option", { name: t("org.hour") }) as HTMLOptionElement).value).toBe("hour");
    fireEvent.change(group, { target: { value: "hour" } });
    fireEvent.click(screen.getByRole("button", { name: t("common.apply") }));
    expect(apply).toHaveBeenCalledWith({}, "hour");
  });

  it("changes an already-visible parameterized error without losing its values", () => {
    setLocale("en");
    render(<FormMessage message={t("admin.setting_range", { p0: 1, p1: 5 })} />);
    act(() => setLocale("ru"));
    expect(screen.getByRole("status").textContent).toBe("Укажите значение от 1 до 5.");
    act(() => setLocale("kk"));
    expect(screen.getByRole("status").textContent).toBe("1 мен 5 арасындағы мәнді таңдаңыз.");
  });

  it("uses Russian plural rules for one, few and many", () => {
    setLocale("ru");
    expect(quantityLabel("ticket", 1)).toBe("1 билет");
    expect(quantityLabel("ticket", 2)).toBe("2 билета");
    expect(quantityLabel("ticket", 5)).toBe("5 билетов");
    expect(quantityLabel("ticket", 21)).toBe("21 билет");
    expect(quantityLabel("seat", 22)).toBe("22 места");
  });

  it.each(["ru", "kk"] as const)("localizes live campaign/refund errors and backend states in %s", (locale) => {
    setLocale(locale);
    expect(failureMessage("refund_cutoff_passed", 409)).toBe(t("errors.refund_cutoff_passed"));
    expect(failureMessage("promo_code_taken", 409)).toBe(t("errors.promo_code_taken"));
    expect(statusLabel("refund_pending")).toBe(t("status.refund_pending"));
    expect(statusLabel("event.created")).not.toMatch(/[A-Za-z]/);
    expect(statusLabel("already_checked_in")).not.toMatch(/[A-Za-z]/);
  });
});
