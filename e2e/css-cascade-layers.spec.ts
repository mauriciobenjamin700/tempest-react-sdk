import { expect, test } from "@playwright/test";

/**
 * Browser verification for #809:
 *
 * 1. An unlayered consumer rule with equal specificity (`.probe-full-width`),
 *    even when injected at the very top of `<head>` BEFORE the SDK's global
 *    stylesheet and per-component stylesheets, beats `.tempest_wrapper_*`
 *    (`max-width: 360px`) because SDK component styles live inside
 *    `@layer tempest.components`.
 * 2. `SearchBar` with `fullWidth` removes the `360px` cap natively.
 * 3. Token sheets stay unlayered so an unlayered `:root` override in the app
 *    does not crush `[data-tempest-theme="dark"]` tokens.
 */
for (const width of [390, 1280]) {
    test.describe(`CSS cascade layers at ${width}px`, () => {
        test.use({ viewport: { width, height: 900 } });

        test("unlayered app override beats component CSS even when declared earlier in <head>", async ({
            page,
        }) => {
            await page.goto("/");
            const demo = page.locator("#ex-searchbar .example-demo");
            await demo.scrollIntoViewIfNeeded();

            const result = await demo.evaluate((root) => {
                const style = document.createElement("style");
                style.textContent = ".probe-full-width { width: 100%; max-width: none; }";
                document.head.prepend(style);

                const wrappers = [...root.querySelectorAll("[class*='tempest_wrapper_']")];
                const defaultBar = wrappers[0] as HTMLElement;
                const fullWidthBar = wrappers[1] as HTMLElement;

                const beforeMaxWidth = getComputedStyle(defaultBar).maxWidth;
                const beforeWidth = defaultBar.getBoundingClientRect().width;

                defaultBar.classList.add("probe-full-width");
                const afterMaxWidth = getComputedStyle(defaultBar).maxWidth;
                const afterWidth = defaultBar.getBoundingClientRect().width;

                const propMaxWidth = getComputedStyle(fullWidthBar).maxWidth;
                const propWidth = fullWidthBar.getBoundingClientRect().width;

                defaultBar.classList.remove("probe-full-width");
                style.remove();

                return {
                    beforeMaxWidth,
                    beforeWidth,
                    afterMaxWidth,
                    afterWidth,
                    propMaxWidth,
                    propWidth,
                };
            });

            expect(result.beforeMaxWidth).toBe("360px");
            expect(result.afterMaxWidth).toBe("none");
            expect(result.propMaxWidth).toBe("100%");
            if (width >= 1024) {
                expect(result.beforeWidth).toBeLessThanOrEqual(360.5);
                expect(result.afterWidth).toBeGreaterThan(400);
                expect(result.propWidth).toBeGreaterThan(400);
            }
        });

        test("unlayered :root token override does not crush dark theme tokens", async ({
            page,
        }) => {
            await page.emulateMedia({ colorScheme: "dark" });
            await page.goto("/");
            await expect(page.locator("html")).toHaveAttribute("data-tempest-theme", "dark");

            const tokens = await page.evaluate(() => {
                const style = document.createElement("style");
                style.textContent = ":root { --tempest-primary: #ff00ff; }";
                document.head.prepend(style);

                const computed = getComputedStyle(document.documentElement);
                const bg = computed.getPropertyValue("--tempest-bg").trim();
                const primary = computed.getPropertyValue("--tempest-primary").trim();

                style.remove();
                return { bg, primary };
            });

            expect(tokens.bg).toBe("#0b0d12");
            expect(tokens.primary).not.toBe("#ff00ff");
        });
    });
}
