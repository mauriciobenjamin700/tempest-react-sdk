import { expect, test, type Page } from "@playwright/test";

/**
 * What `Reveal` does in a real browser, against the gallery section `reveal`.
 *
 * jsdom has no layout, no paint and no `IntersectionObserver`, so the four
 * acceptance criteria of #408 — enter once on scroll, stay still under reduced
 * motion, stay visible without an observer, reveal a box taller than the
 * viewport — can only be measured here. The viewport is pinned so the geometry
 * of the tall block is the same on every run.
 */

const VIEWPORT = { width: 1280, height: 900 };
const STAGGER_ITEMS = "#reveal-stagger ol > li";
const TALL = '[data-testid="reveal-tall"]';

interface Computed {
    state: string | undefined;
    opacity: string;
    transform: string;
}

/**
 * Read the state and the painted opacity/transform of every match.
 *
 * @param page - The gallery page.
 * @param selector - CSS selector of the `Reveal` elements.
 * @returns One entry per element, in document order.
 */
async function computed(page: Page, selector: string): Promise<Computed[]> {
    return page.evaluate(
        (sel) =>
            [...document.querySelectorAll<HTMLElement>(sel)].map((element) => {
                const style = getComputedStyle(element);
                return {
                    state: element.dataset.state,
                    opacity: style.opacity,
                    transform: style.transform,
                };
            }),
        selector,
    );
}

/**
 * Scroll so the top of `selector` sits `top` px below the top of the viewport.
 *
 * @param page - The gallery page.
 * @param selector - Element to position.
 * @param top - Wanted distance from the viewport top, in px.
 * @returns How many px of the element are inside the viewport afterwards.
 */
async function placeAt(page: Page, selector: string, top: number): Promise<number> {
    return page.evaluate(
        ([sel, offset]) => {
            const element = document.querySelector(sel) as HTMLElement;
            const y = element.getBoundingClientRect().top + window.scrollY;
            window.scrollTo(0, y - offset);
            const box = element.getBoundingClientRect();
            return Math.round(
                Math.max(0, Math.min(box.bottom, innerHeight) - Math.max(box.top, 0)),
            );
        },
        [selector, top] as const,
    );
}

test.describe("Reveal", () => {
    test.use({ viewport: VIEWPORT });

    test("starts hidden below the fold and enters once, staggered by delay", async ({ page }) => {
        await page.goto("/");
        await page.waitForSelector(STAGGER_ITEMS);
        for (const item of await computed(page, STAGGER_ITEMS)) {
            expect(item).toMatchObject({ state: "hidden", opacity: "0" });
        }

        await page.evaluate((sel) => {
            const items = [...document.querySelectorAll<HTMLElement>(sel)];
            const starts: number[] = [];
            const tick = (now: number): void => {
                items.forEach((element, index) => {
                    if (
                        starts[index] === undefined &&
                        Number(getComputedStyle(element).opacity) > 0.02
                    ) {
                        starts[index] = now;
                    }
                });
                if (starts.filter((start) => start !== undefined).length < items.length) {
                    requestAnimationFrame(tick);
                }
            };
            Object.assign(window, { __revealStarts: starts });
            requestAnimationFrame(tick);
            document.querySelector("#reveal-stagger")?.scrollIntoView({ block: "start" });
        }, STAGGER_ITEMS);

        await expect
            .poll(() =>
                computed(page, STAGGER_ITEMS).then((items) =>
                    items.every((i) => i.opacity === "1"),
                ),
            )
            .toBe(true);
        const starts = await page.evaluate(
            () => (window as unknown as { __revealStarts: number[] }).__revealStarts,
        );
        const gaps = starts.slice(1).map((start, index) => start - (starts[index] as number));
        for (const gap of gaps) {
            expect(gap).toBeGreaterThan(50);
            expect(gap).toBeLessThan(160);
        }
        for (const item of await computed(page, STAGGER_ITEMS)) {
            expect(item).toEqual({ state: "shown", opacity: "1", transform: "none" });
        }
    });

    test("reveals a block taller than the viewport that never reaches the raw threshold", async ({
        page,
    }) => {
        await page.goto("/");
        await page.waitForSelector(TALL);
        const maxRatio = await page.evaluate((sel) => {
            const element = document.querySelector(sel) as HTMLElement;
            return Math.min(1, innerHeight / element.offsetHeight);
        }, TALL);
        expect(maxRatio).toBeLessThan(0.5);

        expect(await placeAt(page, TALL, 500)).toBeLessThan(VIEWPORT.height / 2);
        await page.waitForTimeout(200);
        expect((await computed(page, TALL))[0]?.state).toBe("hidden");

        expect(await placeAt(page, TALL, 400)).toBeGreaterThan(VIEWPORT.height / 2);
        await expect.poll(async () => (await computed(page, TALL))[0]?.state).toBe("shown");
    });

    test("keeps every state visible and still under prefers-reduced-motion", async ({
        browser,
    }) => {
        const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" });
        const page = await context.newPage();
        await page.goto("/");
        await page.waitForSelector(STAGGER_ITEMS);
        const items = await computed(page, `${STAGGER_ITEMS}, #reveal-variants [data-variant]`);
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
            expect(item).toEqual({ state: "hidden", opacity: "1", transform: "none" });
        }
        await context.close();
    });

    test("leaves content visible when IntersectionObserver does not exist", async ({ page }) => {
        await page.addInitScript(() => {
            Reflect.deleteProperty(window, "IntersectionObserver");
        });
        await page.goto("/");
        await page.waitForSelector(STAGGER_ITEMS);
        for (const item of await computed(page, `${STAGGER_ITEMS}, ${TALL}`)) {
            expect(item).toEqual({ state: "static", opacity: "1", transform: "none" });
        }
    });
});
