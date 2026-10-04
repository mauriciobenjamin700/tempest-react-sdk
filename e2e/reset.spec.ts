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

/**
 * Swap the gallery's `#root` for a fresh one holding `html`.
 *
 * The rules under test key on `#root` and on how many children it holds, so the
 * probe has to own that element outright. The gallery's own root is renamed and
 * hidden rather than removed: React keeps its reference, and the published
 * stylesheet stays applied to the page.
 *
 * @param page - The gallery page, stylesheet loaded.
 * @param html - Markup for the new `#root`.
 */
async function mountRoot(page: Page, html: string): Promise<void> {
    await page.evaluate((markup) => {
        const gallery = document.getElementById("root") as HTMLElement;
        gallery.id = "gallery-root";
        gallery.style.display = "none";
        const root = document.createElement("div");
        root.id = "root";
        root.innerHTML = markup;
        document.body.append(root);
    }, html);
}

/**
 * Scroll the document and report where the probe sits in the viewport.
 *
 * @param page - The page holding a `[data-probe]` element.
 * @param y - Vertical scroll offset to apply.
 * @returns The applied `scrollY` and the probe's top edge relative to the viewport.
 */
async function topAfterScroll(page: Page, y: number): Promise<{ scrollY: number; top: number }> {
    return page.evaluate(async (offset) => {
        window.scrollTo(0, offset);
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        const probe = document.querySelector("[data-probe]") as HTMLElement;
        return { scrollY: window.scrollY, top: Math.round(probe.getBoundingClientRect().top) };
    }, y);
}

/**
 * Outer HTML of the gallery's live `AppShell` demo, with a marker on its bar.
 *
 * Cloning the rendered demo carries the real hashed class names of `AppShell`,
 * `Navbar` and `Page`, so the probe exercises the published component sheets
 * rather than a hand-written imitation of them.
 *
 * @param page - The gallery page.
 * @returns The shell markup.
 */
async function appShellMarkup(page: Page): Promise<string> {
    return page.evaluate(() => {
        const main = document.querySelector("#ex-appshell main") as HTMLElement;
        const shell = (main.parentElement as HTMLElement).parentElement as HTMLElement;
        const clone = shell.cloneNode(true) as HTMLElement;
        clone.querySelector("header")?.setAttribute("data-probe", "");
        return clone.outerHTML;
    });
}

/**
 * How `#root` sizes itself (#406).
 *
 * A fixed `height: 100%` on `#root` made it the containing block of a sticky bar
 * placed directly inside it, so the bar left the screen after one viewport —
 * `top: -417px` at `scrollY` 1261 at 1440x900. Plain `min-height: 100%` fixes the
 * bar but collapses every percentage-height shell onto its content (`Page` 900px
 * to 271px). The reset keeps the definite height for a single child and lets
 * `#root` grow otherwise; these pin both halves.
 */
test.describe("reset: the app root (#406)", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test.beforeEach(async ({ page }) => {
        await page.goto("/");
        await page.waitForFunction(() => document.fonts.status === "loaded");
    });

    test("a sticky bar placed directly in #root stays on screen past one viewport", async ({
        page,
    }) => {
        await mountRoot(
            page,
            `<header data-probe style="position:sticky;top:0;height:56px">bar</header><main style="height:2400px">long</main>`,
        );

        expect(await topAfterScroll(page, 1261)).toEqual({ scrollY: 1261, top: 0 });
    });

    test("the SDK Navbar placed directly in #root stays on screen too", async ({ page }) => {
        const navbar = await page.evaluate(
            () => (document.querySelector("#ex-appshell header") as HTMLElement).outerHTML,
        );
        await mountRoot(
            page,
            navbar.replace("<header", "<header data-probe") +
                `<main style="height:2400px">long</main>`,
        );

        expect(await topAfterScroll(page, 1261)).toEqual({ scrollY: 1261, top: 0 });
    });

    test("the Navbar inside AppShell stays on screen when the page scrolls", async ({ page }) => {
        const shell = await appShellMarkup(page);
        await mountRoot(page, shell);
        await page.evaluate(() => {
            const filler = document.createElement("div");
            filler.style.height = "2400px";
            (document.querySelector("#root main") as HTMLElement).append(filler);
        });

        expect(await topAfterScroll(page, 1261)).toEqual({ scrollY: 1261, top: 0 });
    });

    test("a single percentage-height child still fills the viewport", async ({ page }) => {
        await mountRoot(page, `<div data-probe style="height:100%">short</div>`);

        const height = await page.evaluate(
            () => (document.querySelector("[data-probe]") as HTMLElement).offsetHeight,
        );
        expect(height).toBe(900);
    });

    test("a Page as the single child of #root still fills the viewport", async ({ page }) => {
        const pageMarkup = await page.evaluate(() => {
            const main = document.querySelector("#ex-appshell main") as HTMLElement;
            return (main.firstElementChild as HTMLElement).outerHTML;
        });
        await mountRoot(page, pageMarkup);

        const height = await page.evaluate(
            () =>
                ((document.getElementById("root") as HTMLElement).firstElementChild as HTMLElement)
                    .offsetHeight,
        );
        expect(height).toBe(900);
    });
});
