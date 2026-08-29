import { expect, test, type Page } from "@playwright/test";

/**
 * What the reset does to markup the SDK does not own.
 *
 * jsdom cannot answer this: the defect is a layout offset, and jsdom computes no
 * layout. The gallery is loaded only to get the published stylesheet onto a real
 * page; the elements under test are injected, because the point is markup a
 * consumer writes rather than a component the SDK ships.
 */

/**
 * Insert markup at the end of `<body>` and measure a child against its parent.
 *
 * @param page - The page with the stylesheet already applied.
 * @param html - Markup to insert; the measured child carries `data-probe`.
 * @returns Horizontal and vertical offset of the child's centre from the parent's.
 */
async function centreOffset(page: Page, html: string): Promise<{ dx: number; dy: number }> {
    return page.evaluate((markup) => {
        const host = document.createElement("div");
        host.innerHTML = markup;
        document.body.append(host);
        const parent = host.firstElementChild as HTMLElement;
        const child = host.querySelector("[data-probe]") as HTMLElement;
        const outer = parent.getBoundingClientRect();
        const inner = child.getBoundingClientRect();
        const offset = {
            dx: inner.left + inner.width / 2 - (outer.left + outer.width / 2),
            dy: inner.top + inner.height / 2 - (outer.top + outer.height / 2),
        };
        host.remove();
        return offset;
    }, html);
}

const ICON = `<svg data-probe width="20" height="20" viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" stroke="currentColor" fill="none"/></svg>`;

test.describe("reset", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/");
        await page.waitForFunction(() => document.fonts.status === "loaded");
    });

    test("a lone icon stays centred in a plain button", async ({ page }) => {
        const offset = await centreOffset(
            page,
            `<button style="width:44px;height:44px;padding:0;border:0">${ICON}</button>`,
        );

        expect(Math.abs(offset.dx)).toBeLessThanOrEqual(1);
        expect(Math.abs(offset.dy)).toBeLessThanOrEqual(1);
    });

    test("the same holds for a link, a label and a summary", async ({ page }) => {
        const box = "display:block;width:44px;height:44px;padding:0;border:0;text-align:center";
        for (const markup of [
            `<a href="#" style="${box}">${ICON}</a>`,
            `<label style="${box}">${ICON}</label>`,
            `<summary style="${box}">${ICON}</summary>`,
        ]) {
            const offset = await centreOffset(page, markup);
            expect(Math.abs(offset.dx), markup.slice(0, 12)).toBeLessThanOrEqual(1);
        }
    });

    test("an icon next to a label is left alone", async ({ page }) => {
        const offset = await centreOffset(
            page,
            `<button style="width:160px;height:44px;padding:0 12px;border:0;display:flex;align-items:center;gap:8px">${ICON}<span>Salvar</span></button>`,
        );

        expect(offset.dx).toBeLessThan(-20);
    });

    test("a consumer rule beats the default without !important", async ({ page }) => {
        await page.addStyleTag({
            content: `.pinned > svg { margin-inline: 0; }`,
        });
        const offset = await centreOffset(
            page,
            `<button class="pinned" style="width:44px;height:44px;padding:0;border:0">${ICON}</button>`,
        );

        expect(offset.dx).toBeLessThan(-8);
    });
});
