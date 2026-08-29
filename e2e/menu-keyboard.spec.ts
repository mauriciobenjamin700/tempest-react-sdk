import { expect, test } from "@playwright/test";

/**
 * The menu keyboard, driven by a real browser.
 *
 * jsdom plus `userEvent` already covers the model, and it is a good check — it
 * moves real focus. What it cannot cover is the browser's own handling around it:
 * that `Space` does not scroll the page instead of opening, that `Tab` really
 * hands over to the page's tab order, and that the roving `tabindex` produces the
 * focus ring the user actually sees.
 */

/** The gallery section holding the toggle example. */
const SECTION = "#dropdown-checkbox";

test.describe("DropdownMenu keyboard", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`/${SECTION}`);
        await page.waitForFunction(() => document.fonts.status === "loaded");
    });

    test("ArrowDown from the trigger opens the menu and focuses the first entry", async ({
        page,
    }) => {
        const trigger = page.locator(`${SECTION} button`, { hasText: "Mais opções" }).first();
        await trigger.focus();
        await page.keyboard.press("ArrowDown");

        await expect(page.getByRole("menu")).toBeVisible();
        await expect(page.getByRole("menuitemcheckbox")).toBeFocused();
    });

    test("ArrowUp from the trigger lands on the last entry", async ({ page }) => {
        const trigger = page.locator(`${SECTION} button`, { hasText: "Mais opções" }).first();
        await trigger.focus();
        await page.keyboard.press("ArrowUp");

        await expect(page.getByRole("menuitem", { name: "Configurações" })).toBeFocused();
    });

    test("Space opens the menu and swallows the page-scroll default", async ({ page }) => {
        const trigger = page.locator(`${SECTION} button`, { hasText: "Mais opções" }).first();
        await trigger.focus();

        /*
         * Asserting on `scrollY` would measure the wrong thing: opening the menu
         * moves focus to the first entry, and the browser scrolls that into view.
         * What has to be true is that the key's own default — scrolling a page by
         * one screen — was cancelled, which is exactly what `defaultPrevented`
         * reports.
         */
        await page.evaluate(() => {
            (window as unknown as { __spaceDefault?: boolean }).__spaceDefault = undefined;
            window.addEventListener(
                "keydown",
                (event) => {
                    if (event.key === " ") {
                        (window as unknown as { __spaceDefault?: boolean }).__spaceDefault =
                            event.defaultPrevented;
                    }
                },
                { once: true },
            );
        });

        await page.keyboard.press("Space");

        await expect(page.getByRole("menu")).toBeVisible();
        const prevented = await page.evaluate(
            () => (window as unknown as { __spaceDefault?: boolean }).__spaceDefault,
        );
        expect(prevented).toBe(true);
    });

    test("Escape closes and puts focus back on the trigger", async ({ page }) => {
        const trigger = page.locator(`${SECTION} button`, { hasText: "Mais opções" }).first();
        await trigger.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("menu")).toBeVisible();

        await page.keyboard.press("Escape");

        await expect(page.getByRole("menu")).toHaveCount(0);
        await expect(trigger).toBeFocused();
    });

    test("Tab leaves the menu instead of walking it entry by entry", async ({ page }) => {
        const trigger = page.locator(`${SECTION} button`, { hasText: "Mais opções" }).first();
        await trigger.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("menuitemcheckbox")).toBeFocused();

        await page.keyboard.press("Tab");

        await expect(page.getByRole("menu")).toHaveCount(0);
        const inMenu = await page.evaluate(
            () => document.activeElement?.getAttribute("role") ?? null,
        );
        expect(inMenu).not.toBe("menuitem");
        expect(inMenu).not.toBe("menuitemcheckbox");
    });

    test("a toggle keeps the menu open and flips aria-checked", async ({ page }) => {
        const trigger = page.locator(`${SECTION} button`, { hasText: "Mais opções" }).first();
        await trigger.focus();
        await page.keyboard.press("Enter");

        const toggle = page.getByRole("menuitemcheckbox");
        await expect(toggle).toHaveAttribute("aria-checked", "false");

        await page.keyboard.press("Enter");

        await expect(page.getByRole("menu")).toBeVisible();
        await expect(page.getByRole("menuitemcheckbox")).toHaveAttribute("aria-checked", "true");
    });
});
