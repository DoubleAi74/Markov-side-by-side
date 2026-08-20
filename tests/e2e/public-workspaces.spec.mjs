import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const route of ["/", "/gillespie", "/ctmp-inhomo", "/sde"]) {
  test(`${route} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByText("Markov Lab", { exact: false }).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact))).toEqual([]);
  });
}

test("worker-backed Gillespie run reaches a fresh result", async ({ page }) => {
  await page.goto("/gillespie");
  await page.getByLabel("Result retention").selectOption("summary");
  await page.getByRole("button", { name: "Run", exact: true }).last().click();
  await expect(page.getByText(/Results current/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/sample paths retained/)).toBeVisible();
});

test("mobile editor keeps Run available", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile project only");
  await page.goto("/sde");
  await expect(page.getByRole("button", { name: "Run", exact: true }).last()).toBeVisible();
});
