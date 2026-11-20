import { expect, type Browser, type Page } from "@playwright/test";
import type { Account } from "./api";

/** A separate browser profile, so two people can be signed in at the same time. */
export async function newPerson(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    locale: "en-US",
    timezoneId: "Asia/Almaty",
  });
  return context.newPage();
}

/** Sign in through the real form, like a person would. */
export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.locator("#auth-form").getByRole("button", { name: /Sign in/ }).click();
  await expect(page).toHaveURL(/\/discover/);
}

/** Choose one ticket of a type on the event page and reserve it (step one of checkout). */
export async function reserveOne(page: Page, ticketName: string): Promise<void> {
  await page.getByLabel(`Quantity for ${ticketName}`).selectOption("1");
  await page.getByRole("button", { name: /^Reserve/ }).click();
  await expect(page.getByRole("heading", { name: "Who is coming?" })).toBeVisible();
}

export function orderIdFromUrl(url: string): string {
  const match = /\/orders\/([0-9a-f-]{36})/.exec(url);
  if (!match?.[1]) throw new Error(`Not an order page: ${url}`);
  return match[1];
}
