import { expect, test } from "@playwright/test";
import { call, createAccount, createPublishedEvent, entryConfirmation, scan } from "../support/api";
import { orderIdFromUrl, reserveOne, signIn } from "../support/ui";

// AC-02, AC-11 (one ticket, one admission), AC-13: a free registration in the browser
// produces a ticket, and the scanner API admits it exactly once.
test("free registration -> ticket -> check-in at the door", async ({ page }) => {
  const organizer = await createPublishedEvent("Free Night", [
    { key: "free", name: "General admission", kind: "free", priceMinor: 0 },
  ]);
  const attendee = await createAccount("Aru Attendee");

  await signIn(page, attendee);
  await page.goto(`/events/${organizer.event.id}`);
  await reserveOne(page, "General admission");
  await page.getByRole("button", { name: "Confirm registration" }).click();

  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  const orderId = orderIdFromUrl(page.url());
  await expect(page.getByText("Registration confirmed").first()).toBeVisible();

  // The ticket is in the attendee's account.
  await page.goto("/tickets");
  await expect(page.getByText(organizer.event.title)).toBeVisible();
  const order = await call("GET", `/orders/${orderId}`, { token: attendee.token });
  expect(order.status).toBe("confirmed");
  expect(order.payable_minor).toBe(0);
  const ticket = order.items[0].ticket;
  await page.goto(`/tickets/${ticket.id}`);
  await expect(page.getByRole("heading", { name: organizer.event.title, level: 1 })).toBeVisible();

  // At the door: without the attendee's confirmation the scan is refused,
  // with it the person is admitted, and the same ticket cannot be used twice.
  expect((await scan(organizer, ticket.qr_payload)).status).toBe(409);
  const proof = await entryConfirmation(attendee, ticket.id);
  const admitted = await scan(organizer, ticket.qr_payload, proof);
  expect(admitted.status).toBe(200);
  expect(await admitted.json()).toMatchObject({ attendee_name: attendee.name });
  expect((await scan(organizer, ticket.qr_payload, proof)).status).toBe(409);

  // The ticket page now shows the admission.
  await page.reload();
  await expect(page.getByText(/checked in/i).first()).toBeVisible();
});
