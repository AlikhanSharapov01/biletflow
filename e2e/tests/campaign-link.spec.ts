import { expect, test } from "@playwright/test";
import { activatePaidSales, call, createAccount, createCampaign, createPublishedEvent, scan } from "../support/api";
import { orderIdFromUrl, reserveOne, signIn } from "../support/ui";

// AC-09/AC-10: a Campaign QR link opens the event with its code applied, the discount is
// calculated by the server and saved on the order, and the scanner never accepts the link.
test("Campaign QR link -> discount -> order", async ({ page }) => {
  const organizer = await createPublishedEvent("Promo Night", [
    { key: "paid", name: "Standard", kind: "paid", priceMinor: 400_000 },
  ]);
  await activatePaidSales(organizer);
  const campaign = await createCampaign(organizer, "SAVE10", 10);
  const attendee = await createAccount("Aru Buyer");

  // The campaign link is not an admission ticket.
  const rejected = await scan(organizer, campaign.link_url);
  expect(rejected.status).toBe(422);

  await signIn(page, attendee);
  // The link contains an opaque token, never a price or a discount.
  const token = new URL(campaign.link_url).pathname.split("/").pop();
  expect(new URL(campaign.link_url).search).toBe("");
  await page.goto(`/c/${token}`);

  await expect(page).toHaveURL(new RegExp(`/events/${organizer.event.id}\\?promo=SAVE10`));
  // The code is applied before anything is reserved (it can be removed again).
  await expect(page.getByRole("button", { name: "Remove" })).toBeVisible();

  await reserveOne(page, "Standard");
  // The hold shows the server's discounted price: 4,000 less 10%.
  await expect(page.getByText(/3,600/).first()).toBeVisible();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);

  const order = await call("GET", `/orders/${orderIdFromUrl(page.url())}`, { token: attendee.token });
  expect(order.status).toBe("confirmed");
  expect(order.gross_minor).toBe(400_000);
  expect(order.discount_minor).toBe(40_000);
  expect(order.payable_minor).toBe(360_000);
  expect(order.promo.code).toBe("SAVE10");
  await expect(page.getByText("Promo code: SAVE10")).toBeVisible();

  // The organizer's campaign report attributes the sale to the campaign.
  const report = await call("GET", `/events/${organizer.event.id}/campaigns/${campaign.id}/report`, {
    token: organizer.account.token,
  });
  expect(report).toMatchObject({ redemptions: 1, tickets: 1, discount_minor: 40_000, collected_minor: 360_000 });
});
