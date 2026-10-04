import { expect, test, type Page } from "@playwright/test";

/**
 * `data-tempest-tone="default"` inside an inverse surface (#420): a region of a
 * brand-colored band that goes back to the page's tokens.
 *
 * jsdom cannot answer this: it resolves no custom property through inheritance.
 * The gallery renders the same `Card` with an `Input` and a `Button` twice, once
 * in the default region of an inverse `Section` and once outside it, inside the
 * section that applies a scoped `createTheme` — so the check also covers a theme
 * that is neither `:root` nor the SDK's own blue.
 *
 * Before the restore rules, 25 of 28 computed values of that trio differed from
 * the page in light and 18 of 28 in dark (Chromium, 04/10/2026).
 */

/** Computed properties that carry the tokens a `Card`, `Input` and `Button` read. */
const PROPERTIES = [
    "color",
    "backgroundColor",
    "borderTopColor",
    "boxShadow",
    "colorScheme",
    "caretColor",
    "outlineColor",
] as const;

/** Parts of the trio compared, by selector inside the card. */
const PARTS = {
    card: ":scope",
    title: "h3",
    label: "label",
    input: "input",
    button: "button",
} as const;

/**
 * Read the computed style of every part of one card.
 *
 * @param page - The gallery page.
 * @param testId - `data-testid` of the card.
 * @returns `part.property` → computed value.
 */
async function readCard(page: Page, testId: string): Promise<Record<string, string>> {
    return page.getByTestId(testId).evaluate(
        (card, { parts, properties }) => {
            const out: Record<string, string> = {};
            for (const [part, selector] of Object.entries(parts)) {
                const element = selector === ":scope" ? card : card.querySelector(selector);
                if (!element) throw new Error(`${part} (${selector}) missing from the card`);
                const style = getComputedStyle(element);
                for (const property of properties) {
                    out[`${part}.${property}`] = style[
                        property as keyof CSSStyleDeclaration
                    ] as string;
                }
            }
            return out;
        },
        { parts: PARTS, properties: PROPERTIES },
    );
}

test.describe("inverse surface — default tone", () => {
    for (const scheme of ["light", "dark"] as const) {
        test(`a Card, Input and Button in the region match the page — ${scheme}`, async ({
            page,
        }) => {
            await page.emulateMedia({ colorScheme: scheme });
            await page.goto("/");
            await page.addStyleTag({
                content:
                    "*, *::before, *::after { transition: none !important; animation: none !important; }",
            });
            await expect(page.locator("html")).toHaveAttribute("data-tempest-theme", scheme);

            const region = await readCard(page, "tone-default-card");
            const reference = await readCard(page, "tone-default-reference");

            expect(region).toEqual(reference);
            expect(region["card.colorScheme"]).toBe(scheme);
        });
    }
});
