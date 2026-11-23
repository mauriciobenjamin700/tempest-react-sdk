import { expect, test } from "@playwright/test";

/**
 * Layout guarantees that jsdom cannot see, measured on the gallery demos.
 *
 * #710: two blocks inside a `Card` met at 0 px, because every SDK component zeroes
 * its own margin and the card body was a plain block. #740: recharts reserved a
 * fixed 60 px for the Y axis and `"R$ 50.000"` started 10 px left of the chart at
 * every viewport width. Both are paint, so both are asserted in a real browser.
 */

for (const width of [390, 1280]) {
    test.describe(`at ${width}px`, () => {
        test.use({ viewport: { width, height: 900 } });

        test("spaces a Stat and a Timeline stacked inside a Card", async ({ page }) => {
            await page.goto("/");
            const demo = page.locator("#ex-stat-polarity .example-demo");
            await demo.scrollIntoViewIfNeeded();
            const gap = await demo.evaluate((root) => {
                const stat = root.querySelector("[class*='card'] [class*='stat']");
                const list = root.querySelector("[class*='card'] ol");
                if (!stat || !list) return Number.NaN;
                return list.getBoundingClientRect().top - stat.getBoundingClientRect().bottom;
            });
            expect(gap).toBe(16);
        });

        test("keeps every value-axis label inside the chart", async ({ page }) => {
            await page.goto("/");
            const demo = page.locator("#ex-chart-labels-axis .example-demo");
            await demo.scrollIntoViewIfNeeded();
            await expect(demo.locator("text[orientation='left']").first()).toBeVisible();
            const offsets = await demo.evaluate((root) =>
                [...root.querySelectorAll("svg[role='application']")].flatMap((svg) => {
                    const left = svg.getBoundingClientRect().left;
                    return [...svg.querySelectorAll("text[orientation='left']")].map(
                        (tick) => tick.getBoundingClientRect().left - left,
                    );
                }),
            );
            expect(offsets.length).toBeGreaterThan(0);
            expect(Math.min(...offsets)).toBeGreaterThanOrEqual(0);
        });
    });
}
