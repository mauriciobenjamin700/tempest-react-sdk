import { expect, test, type Page } from "@playwright/test";

/**
 * A sticky bar rendered inside `AppShell`'s `<main>` stays on screen (#611).
 *
 * `.main` used to carry `overflow-x: auto`. Per CSS Overflow 3 that forces the
 * computed `overflow-y` to `auto` as well, so `<main>` became the scroll
 * container of every sticky descendant — yet it never scrolls: it grows with
 * the content and the window does the scrolling. Measured in Chromium against
 * the built gallery, at 390x844 and at 1280x800 alike, an `AppBar` inside the
 * page sat at `top: -600px` after `scrollTo(0, 600)`.
 *
 * Both fixes the issue proposed bring the bar back to `top: 0`; they differ on
 * a child wider than `<main>` that has no scroll region of its own (a 1500px
 * block, measured on the same page):
 *
 * | `.main`              | bar top | page `scrollWidth` at 390 / 1280 |
 * | -------------------- | ------- | -------------------------------- |
 * | `overflow-x: auto`   | -600    | 390 / 1280                       |
 * | `overflow: visible`  | 0       | 1500 / 1700 (the page pans)      |
 * | `overflow-x: clip`   | 0       | 390 / 1280                       |
 *
 * `clip` keeps the old guarantee that one wide child never pans the whole
 * app sideways — the very thing that sends apps to `body { overflow-x:
 * hidden }`, the CSS that breaks sticky one level up. `Table` (and so
 * `DataTable`) carries its own `overflow-x: auto` wrapper and scrolled the
 * same 1186px of a 12-column table under all three values.
 *
 * jsdom has no layout, so this can only be measured here. The gallery's own
 * chrome wraps every demo in `overflow: hidden`, which would defeat sticky on
 * its own; the test therefore lifts the rendered `AppShell` out of its demo
 * box and makes it the whole document, with a static copy of a rendered
 * `AppBar` as the first child of `<main>`. Every class on both is the built
 * `dist/` CSS.
 */

const VIEWPORTS = [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
] as const;

const SCROLL = 600;

/** What the page reports after the shell is mounted and the window scrolled. */
interface Measured {
    barTop: number;
    mainOverflowY: string;
    pageScrollWidth: number;
    tableScrolls: boolean;
}

/**
 * Turn the gallery into a long app page: the rendered `AppShell` as the whole
 * document, a copy of a rendered `AppBar` at the top of `<main>`, a wide block,
 * a 12-column `Table` copy and enough rows to scroll.
 *
 * @param page - The gallery page, already loaded.
 * @param scroll - How far to scroll the window afterwards, in px.
 * @returns The bar's top edge, `<main>`'s computed `overflow-y`, the page's
 *   horizontal scroll width and whether the table still scrolls on its own.
 */
async function mountLongShellPage(page: Page, scroll: number): Promise<Measured> {
    return page.evaluate(async (y) => {
        const main = document.querySelector("#layout main") as HTMLElement;
        const shell = main.parentElement?.parentElement as HTMLElement;
        const bar = document.querySelector("#navigation header") as HTMLElement;
        const table = document.querySelector("#data-table table")?.parentElement as HTMLElement;

        const copy = shell.cloneNode(true) as HTMLElement;
        const copyMain = copy.querySelector("main") as HTMLElement;
        const wide = document.createElement("div");
        wide.style.width = "1500px";
        wide.style.height = "40px";
        const rows = document.createElement("div");
        rows.style.height = "3000px";
        const tableCopy = table.cloneNode(true) as HTMLElement;
        const firstRow = tableCopy.querySelector("tr") as HTMLTableRowElement;
        for (let index = 0; index < 12; index += 1) {
            const cell = document.createElement("th");
            cell.textContent = `coluna-larga-${index}`;
            cell.style.minWidth = "160px";
            firstRow.append(cell);
        }
        copyMain.replaceChildren(bar.cloneNode(true), wide, tableCopy, rows);
        document.body.replaceChildren(copy);

        window.scrollTo(0, y);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const barCopy = copyMain.querySelector("header") as HTMLElement;
        return {
            barTop: Math.round(barCopy.getBoundingClientRect().top),
            mainOverflowY: getComputedStyle(copyMain).overflowY,
            pageScrollWidth: document.scrollingElement?.scrollWidth ?? 0,
            tableScrolls: tableCopy.scrollWidth > tableCopy.clientWidth,
        };
    }, scroll);
}

for (const viewport of VIEWPORTS) {
    test.describe(`AppShell at ${viewport.width}x${viewport.height}`, () => {
        test.use({ viewport });

        test.beforeEach(async ({ page }) => {
            await page.goto("/");
            await page.locator("#layout main").first().waitFor();
            await page.locator("#navigation header").first().waitFor();
            await page.locator("#data-table table").first().waitFor();
        });

        test("a sticky AppBar inside main stays at the top while the window scrolls", async ({
            page,
        }) => {
            const measured = await mountLongShellPage(page, SCROLL);
            expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(SCROLL);
            expect(measured.barTop).toBe(0);
            expect(measured.mainOverflowY).toBe("visible");
        });

        test("a child wider than main does not pan the page sideways", async ({ page }) => {
            const measured = await mountLongShellPage(page, 0);
            expect(measured.pageScrollWidth).toBe(viewport.width);
        });

        test("a wide Table keeps scrolling inside its own region", async ({ page }) => {
            const measured = await mountLongShellPage(page, 0);
            expect(measured.tableScrolls).toBe(true);
        });
    });
}
