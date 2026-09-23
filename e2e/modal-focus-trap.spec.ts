import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * The Modal focus trap, driven by a real browser (#375).
 *
 * jsdom has no tab navigation of its own: `userEvent.tab()` walks the DOM with
 * its own rules, so it proves the trap's logic but not what Chrome does with the
 * `Tab` the trap leaves alone. Before the fix, measured on the gallery, focus
 * stayed on the opener when the modal opened and every `Tab` walked the page
 * behind the backdrop — `aria-modal="true"` told the screen reader the page was
 * inert while the keyboard kept using it.
 */

/** The gallery example with a Popover, a DropdownMenu and a nested Modal inside. */
const SECTION = "#modal";

/**
 * Describe where focus is: the element's name and whether a dialog holds it.
 *
 * @param page - The page.
 * @returns `"<name>"` inside a dialog, `"out:<name>"` anywhere else.
 */
async function focusStop(page: Page): Promise<string> {
    return page.evaluate(() => {
        const active = document.activeElement as HTMLElement;
        const name = (
            active.getAttribute("aria-label") ??
            active.getAttribute("placeholder") ??
            active.textContent ??
            ""
        ).trim();
        const inDialog = [...document.querySelectorAll("[role=dialog]")].some((dialog) =>
            dialog.contains(active),
        );
        return inDialog ? name : `out:${name}`;
    });
}

/**
 * The outer dialog. `getByRole` does not treat `aria-modal` as hiding the page,
 * so a bare role query also matches the page's own buttons behind the backdrop.
 *
 * @param page - The page.
 * @returns The "Filtros" dialog.
 */
function filters(page: Page): Locator {
    return page.getByRole("dialog", { name: "Filtros" });
}

/**
 * Press a key several times and record where focus lands after each press.
 *
 * @param page - The page.
 * @param key - The key to press.
 * @param times - How many presses.
 * @returns The focus stops, in order.
 */
async function walk(page: Page, key: string, times: number): Promise<string[]> {
    const stops: string[] = [];
    for (let step = 0; step < times; step += 1) {
        await page.keyboard.press(key);
        stops.push(await focusStop(page));
    }
    return stops;
}

test.describe("Modal focus trap", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`/${SECTION}`);
        await page.waitForFunction(() => document.fonts.status === "loaded");
        const opener = page.locator(`${SECTION} button`, { hasText: "Abrir filtros" }).first();
        await opener.focus();
        await page.keyboard.press("Enter");
        await expect(filters(page)).toBeVisible();
    });

    test("focus enters the dialog and Tab cycles only inside it", async ({ page }) => {
        expect(await focusStop(page)).toBe("Fechar");
        expect(await walk(page, "Tab", 6)).toEqual([
            "Período",
            "Ordenar",
            "Salvar filtro",
            "Aplicar",
            "Fechar",
            "Período",
        ]);
        expect(await walk(page, "Shift+Tab", 3)).toEqual(["Fechar", "Aplicar", "Salvar filtro"]);
    });

    test("the portalled Popover panel stays in the cycle", async ({ page }) => {
        await filters(page).getByRole("button", { name: "Período", exact: true }).focus();
        await page.keyboard.press("Enter");
        expect(await walk(page, "Tab", 3)).toEqual(["De", "Até", "Ordenar"]);
        expect(await walk(page, "Shift+Tab", 3)).toEqual(["Até", "De", "Período"]);
    });

    test("Tab out of the DropdownMenu lands on the next stop of the dialog", async ({ page }) => {
        await filters(page).getByRole("button", { name: "Ordenar", exact: true }).focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("menu")).toBeVisible();
        await page.keyboard.press("Tab");
        expect(await focusStop(page)).toBe("Salvar filtro");
    });

    test("a nested modal owns the trap and hands focus back when it closes", async ({ page }) => {
        await filters(page).getByRole("button", { name: "Salvar filtro", exact: true }).focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog", { name: "Salvar filtro" })).toBeVisible();
        expect(await walk(page, "Tab", 3)).toEqual(["Nome do filtro", "Fechar", "Nome do filtro"]);
        await page.keyboard.press("Escape");
        expect(await focusStop(page)).toBe("Salvar filtro");
    });

    test("closing returns focus to the button that opened it", async ({ page }) => {
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(await focusStop(page)).toBe("out:Abrir filtros");
    });
});
