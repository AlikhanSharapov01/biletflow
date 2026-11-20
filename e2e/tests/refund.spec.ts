import { expect, test } from "@playwright/test";
import { activatePaidSales, buyPaidTicket, call, createPublishedEvent, entryConfirmation, scan, until } from "../support/api";
import { newPerson, signIn } from "../support/ui";

// AC-15/AC-16: the attendee asks for a refund, the organizer approves it, the ticket stops
// working at once, and the order ends refunded after the provider's result.
test("attendee refund request -> organizer refund", async ({ browser }) => {
  const organizer = await createPublishedEvent("Refund Night", [
    { key: "paid", name: "Standard", kind: "paid", priceMinor: 400_000 },
  ]);
  await activatePaidSales(organizer);
  const { order, buyer } = await buyPaidTicket(organizer, "paid");
  const ticket = order.items[0].ticket;

  // The attendee asks for a refund. That opens a support case; the order is unchanged.
  const attendeePage = await newPerson(browser);
  await signIn(attendeePage, buyer);
  await attendeePage.goto(`/orders/${order.id}`);
  await attendeePage.getByText("Request a refund", { exact: true }).click();
  await attendeePage.getByLabel("Reason").fill("I can no longer attend");
  await attendeePage.getByRole("button", { name: "Request refund" }).click();
  await expect(attendeePage.getByText(/Refund requested/)).toBeVisible();
  expect((await call("GET", `/orders/${order.id}`, { token: buyer.token })).status).toBe("confirmed");

  // The organizer finds the registration and refunds the whole order.
  const organizerPage = await newPerson(browser);
  await signIn(organizerPage, organizer.account);
  await organizerPage.goto(`/organizer/events/${organizer.event.id}`);
  await organizerPage.getByRole("tab", { name: "Attendees" }).click();
  await organizerPage.getByRole("button", { name: "Refund", exact: true }).click();
  const dialog = organizerPage.getByRole("dialog");
  await dialog.getByLabel(/Reason/).fill("Approved after the request");
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(organizerPage.getByText("Refund requested.")).toBeVisible();

  // The old ticket is invalid at once, before the provider has answered.
  const afterApproval = await call("GET", `/orders/${order.id}`, { token: buyer.token });
  expect(afterApproval.status).toBe("refund_pending");
  const proof = await entryConfirmation(buyer, ticket.id).catch(() => undefined);
  expect((await scan(organizer, ticket.qr_payload, proof)).status).toBeGreaterThanOrEqual(400);

  // The worker sends the refund to the simulator; its success completes the order.
  const attemptId = await until("the refund to reach the simulator", async () => {
    const view = await call("GET", `/orders/${order.id}`, { token: buyer.token });
    return view.refunds?.find((refund: { latest_attempt_id?: string }) => refund.latest_attempt_id)?.latest_attempt_id;
  });
  await call("POST", `/simulator/refunds/${attemptId}/events`, {
    token: buyer.token,
    body: { outcome: "succeeded" },
  });
  const final = await call("GET", `/orders/${order.id}`, { token: buyer.token });
  expect(final.status).toBe("refunded");
  expect(final.items[0].ticket.status).toBe("refunded");

  // The attendee sees it in the browser.
  await attendeePage.goto(`/tickets/${ticket.id}`);
  await expect(attendeePage.getByText(/refunded/i).first()).toBeVisible();
});
