import { expect, test, type Page } from "@playwright/test";

/**
 * An overlay opened while the page is in fullscreen.
 *
 * jsdom cannot answer this one at all: the failure is that the browser paints
 * only the fullscreen element's subtree, so an overlay mounted outside it is
 * invisible and unclickable while looking perfectly healthy in the DOM. There is
 * no layout and no paint in jsdom, so both the broken and the fixed version pass
 * there — which is why the sibling unit test only checks *which* host is picked,
 * and this one checks that the choice actually shows up.
 *
 * The markup is injected rather than driven through the gallery: what is under
 * test is the portal contract, and a plain element in fullscreen with a portalled
 * child is the smallest thing that exercises it.
 */

const HARNESS = `
<div id="stage" style="position:fixed;inset:0;background:#123">
  <div id="behind" style="position:absolute;inset:0"></div>
</div>`;

test.describe("portal in fullscreen", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/");
    });

    /**
     * Add the bare fullscreen stage used by the DOM-level cases.
     *
     * Injected per test rather than in `beforeEach`: it covers the viewport, so
     * leaving it in place would intercept the clicks the component-level case
     * needs.
     *
     * @param page - The loaded page.
     * @returns Nothing.
     */
    async function addStage(page: Page): Promise<void> {
        await page.evaluate((markup) => {
            document.body.insertAdjacentHTML("beforeend", markup);
        }, HARNESS);
    }

    test("an overlay mounted in document.body is unreachable behind the fullscreen element", async ({
        page,
    }) => {
        await addStage(page);
        const result = await page.evaluate(async () => {
            const stage = document.getElementById("stage") as HTMLElement;
            await stage.requestFullscreen();

            const overlay = document.createElement("div");
            overlay.id = "in-body";
            overlay.style.cssText =
                "position:fixed;left:40%;top:40%;width:200px;height:120px;background:#fff";
            document.body.append(overlay);

            const box = overlay.getBoundingClientRect();
            const hit = document.elementFromPoint(
                box.left + box.width / 2,
                box.top + box.height / 2,
            );

            const reached = overlay.contains(hit) || hit === overlay;
            await document.exitFullscreen();
            overlay.remove();
            return { inFullscreen: true, measured: box.width > 0, reached };
        });

        expect(result.measured, "the overlay has a real box").toBe(true);
        expect(result.reached, "and is still not what the pointer hits").toBe(false);
    });

    test("an overlay mounted in the fullscreen element is reachable", async ({ page }) => {
        await addStage(page);
        const result = await page.evaluate(async () => {
            const stage = document.getElementById("stage") as HTMLElement;
            await stage.requestFullscreen();

            const overlay = document.createElement("div");
            overlay.id = "in-stage";
            overlay.style.cssText =
                "position:fixed;left:40%;top:40%;width:200px;height:120px;background:#fff";
            stage.append(overlay);

            const box = overlay.getBoundingClientRect();
            const hit = document.elementFromPoint(
                box.left + box.width / 2,
                box.top + box.height / 2,
            );

            const reached = overlay.contains(hit) || hit === overlay;
            await document.exitFullscreen();
            overlay.remove();
            return { reached };
        });

        expect(result.reached, "the pointer reaches the overlay").toBe(true);
    });

    test("document.fullscreenElement is what the SDK reads to tell the two apart", async ({
        page,
    }) => {
        await addStage(page);
        const result = await page.evaluate(async () => {
            const stage = document.getElementById("stage") as HTMLElement;
            const before = document.fullscreenElement?.id ?? null;
            await stage.requestFullscreen();
            const during = document.fullscreenElement?.id ?? null;
            await document.exitFullscreen();
            const after = document.fullscreenElement?.id ?? null;
            return { before, during, after };
        });

        expect(result).toEqual({ before: null, during: "stage", after: null });
    });

    test("an open Modal moves into the fullscreen element when the page enters it", async ({
        page,
    }) => {
        const trigger = page.getByRole("button", { name: "Abrir Modal" }).first();
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        await expect(page.getByRole("dialog").first()).toBeVisible();

        const before = await page.evaluate(() => {
            const node = document.querySelector("[role='dialog']") as HTMLElement;
            return { parentedToBody: node.closest("main") === null };
        });
        expect(before.parentedToBody, "starts outside main, hanging off body").toBe(true);

        const after = await page.evaluate(async () => {
            const stage = document.querySelector("main") as HTMLElement;
            await stage.requestFullscreen();
            await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
            await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

            const node = document.querySelector("[role='dialog']") as HTMLElement;
            const box = node.getBoundingClientRect();
            const hit = document.elementFromPoint(
                box.left + box.width / 2,
                box.top + box.height / 2,
            );
            const verdict = {
                insideFullscreen: stage.contains(node),
                reached: node.contains(hit) || hit === node,
            };
            await document.exitFullscreen();
            return verdict;
        });

        expect(after.insideFullscreen, "moved into the fullscreen subtree").toBe(true);
        expect(after.reached, "and the pointer reaches it there").toBe(true);
    });
});
