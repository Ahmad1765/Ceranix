// /settings — every section header expands without throwing and the Help
// section's external links + the Log out CTA are visible. We never click
// Log out (that would trash the saved auth state), never click Delete
// account (irreversible), and never persist any toggle changes.

import { test, expect } from "@playwright/test";
import { waitForAppReady } from "../helpers/page";

test.describe("Settings (signed in)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await waitForAppReady(page);
  });

  test("renders hero, profile card, and the five section toggles", async ({
    page,
  }) => {
    await expect(page.getByText("Your settings.")).toBeVisible({
      timeout: 20_000,
    });
    // The string appears twice: as the section title and inside the subtitle
    // "Settings for purchases & sales" — use `exact` to avoid strict mode.
    await expect(
      page.getByText("Purchases & Sales", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Verification, payouts & shipping"),
    ).toBeVisible();
    await expect(page.getByText("Enhance the experience")).toBeVisible();
    await expect(page.getByText("Manage account")).toBeVisible();
    await expect(page.getByText("Help center")).toBeVisible();
    await expect(page.getByText("Log out", { exact: true })).toBeVisible();
  });

  test("Purchases & Sales section expands to show its rows", async ({
    page,
  }) => {
    await page.getByText("Purchases & Sales", { exact: true }).click();
    // Every label below also appears as a subtitle / description elsewhere,
    // so we use exact: true to avoid strict-mode hits.
    await expect(
      page.getByText("Order history", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Bundle discount", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Vacation mode", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Share your profile", { exact: true }),
    ).toBeVisible();
  });

  test("Verification section expands and shows the three rows", async ({
    page,
  }) => {
    await page
      .getByText("Verification, payouts & shipping", { exact: true })
      .click();
    await expect(
      page.getByText("Identity verification", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Payout method", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Shipping address", { exact: true }),
    ).toBeVisible();
  });

  test("Manage account section shows the email row + change-password / delete actions", async ({
    page,
  }) => {
    await page.getByText("Manage account", { exact: true }).click();
    await expect(
      page.getByText(/^[\w.+-]+@[\w-]+\.[\w.-]+$/).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Change password", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Delete account", { exact: true }),
    ).toBeVisible();
  });

  test("Help center section shows the support / terms / privacy rows", async ({
    page,
  }) => {
    await page.getByText("Help center", { exact: true }).click();
    await expect(
      page.getByText("Contact support", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Terms of service", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Privacy policy", { exact: true }),
    ).toBeVisible();
  });
});
