import { expect, test } from "@playwright/test";
import { activatePaidSales, call, createAccount, createPublishedEvent } from "../support/api";
import { orderIdFromUrl, reserveOne, signIn } from "../support/ui";

// AC-03/AC-04/AC-07: paid sales need activation; a failed demonstration payment issues
// nothing, the retry succeeds, and the ticket exists only after the payment succeeded.
test("paid checkout with the payment simulator: failure, retry, success", async ({ page }) => {
  const organizer = await createPublishedEvent("Paid Night", [
    { key: "paid", name: "Standard", kind: "paid", priceMinor: 400_000 },
  ]);
  const attendee = await createAccount("Aru Buyer");

  // Before activation the paid ticket cannot be reserved.
  const early = await call("POST", `/events/${organizer.event.id}/holds`, {
    token: attendee.token,
    body: { items: [{ ticket_type_id: organizer.ticketTypes.paid.id, quantity: 1 }] },
    expect: 409,
  });
  expect(early.detail.code).toBe("paid_sales_inactive");

  await activatePaidSales(organizer);

  await signIn(page, attendee);
  await page.goto(`/events/${organizer.event.id}`);
  await reserveOne(page, "Standard");
  await page.getByRole("button", { name: "Continue to payment" }).click();

  await expect(page.getByText(/Demonstration payment/).first()).toBeVisible();
  await expect(page.getByText(/4,000/).first()).toBeVisible();

  // The provider reports a failure: no ticket, and the page offers a retry.
  await page.getByRole("button", { name: "Simulate failed payment" }).click();
  await expect(page.getByText("The demonstration payment failed.")).toBeVisible();
  await page.getByRole("button", { name: "Try payment again" }).click();

  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);

  const order = await call("GET", `/orders/${orderIdFromUrl(page.url())}`, { token: attendee.token });
  expect(order.status).toBe("confirmed");
  expect(order.payable_minor).toBe(400_000);
  expect(order.items).toHaveLength(1);
  expect(order.items[0].ticket.status).toBe("valid");
  await expect(page.getByText("Demonstration order.")).toBeVisible();

  await page.goto("/tickets");
  await expect(page.getByText(organizer.event.title)).toBeVisible();
});
