/**
 * The default tone: a region inside an inverse surface that goes back to the
 * page's tokens — `data-tempest-tone="default"`, or `<Section tone="default">`.
 * A white form or price `Card` in a navy hero.
 *
 * Lives beside the generator, not in `inverse-render.ts`, so only an app that
 * imports `createInverseSurface` ships it: `createTheme` alone stays the size it
 * was.
 */
import type { PageSelectors } from "./inverse-render";

/** Selector that hands a region inside an inverse surface back to the page's tokens. */
export const DEFAULT_TONE_SELECTOR = '[data-tempest-tone="default"]';

/** `createTheme`'s default `darkSelector`, already covered by `[data-tempest-theme]`. */
const DARK_SELECTOR = '[data-tempest-theme="dark"]';

/** Where `createTheme` writes the page's schemes when told nothing else. */
export const DEFAULT_PAGE_SELECTORS: PageSelectors = {
    selector: ":root",
    darkSelector: DARK_SELECTOR,
};

/**
 * Name of the custom property that keeps the page's value of `token`.
 *
 * @param token - A `--tempest-*` token.
 * @returns The `--tempest-default-*` twin it is saved under.
 */
function twinOf(token: string): string {
    return token.replace("--tempest-", "--tempest-default-");
}

/**
 * The rules that let a region inside an inverse surface go back to the page's
 * tokens, light or dark — whichever the page is on.
 *
 * Custom properties inherit from the parent, so a rule cannot "skip" the
 * inverse section and read `:root` again — and scoping the inverse block away
 * from the region (`@scope (…) to (…)`, `:not()`) changes nothing either, since
 * the region still inherits what its inverse parent declared. Measured in
 * Chromium on a `Card`, an `Input` and a `Button` inside the region, 25 of 28
 * computed values differed from the same trio on the page in light and 18 of 28
 * in dark, with or without `@scope`.
 *
 * What works is saving the page's values before the section overrides them.
 * Every element a theme is declared on (`:root`, `[data-tempest-theme]`, and the
 * theme's own selectors) copies each token the surface redefines into a
 * `--tempest-default-*` twin. `var()` in a custom property resolves on the
 * element that declares it, so the twin holds the page's value — the SDK's, a
 * theme's or the app's own `:root` override — and inherits through the section
 * untouched. The region reads its tokens back from the twins: 0 of 28 values
 * differ, in light, in dark and under a dark subtree.
 *
 * Two alternatives were measured and rejected. Writing the page's values out,
 * one block per scheme, is 1257 B brotli and restores the SDK's defaults rather
 * than the page: with a brand override on `:root`, 3 of 28 values came back
 * wrong. Adding the region to the selectors of `colors.css` costs 15 B brotli,
 * but charges every app and misses the same override.
 *
 * Everything sits under `:where()`, so a class the app puts on the same element
 * still wins. The anchors are left out of the region and the section out of the
 * anchors: a token and its twin declared on one element reference each other,
 * and both resolve to nothing.
 *
 * @param tokens - The tokens the surface redefines.
 * @param selector - Selector the inverse surface is written under.
 * @param page - Selectors the page's schemes are written under.
 * @returns The CSS text of the rules, in the order they must be written.
 */
export function defaultToneRules(
    tokens: readonly string[],
    selector: string,
    page: PageSelectors,
): string {
    const anchors = [
        ...new Set([":root", "[data-tempest-theme]", page.selector, page.darkSelector]),
    ]
        .filter((anchor) => anchor !== DARK_SELECTOR)
        .join(", ");
    const block = (rule: string, declarations: readonly (readonly [string, string])[]): string =>
        `${rule} {\n${declarations.map(([name, value]) => `    ${name}: ${value};`).join("\n")}\n}`;
    return [
        block(
            `:where(:is(${anchors}):not(${selector}))`,
            tokens.map((token) => [twinOf(token), `var(${token})`]),
        ),
        block(
            `:where(${DEFAULT_TONE_SELECTOR}:not(${anchors}))`,
            tokens.map((token) => [token, `var(${twinOf(token)})`]),
        ),
        block(`:where(${DEFAULT_TONE_SELECTOR})`, [
            ["color-scheme", "light"],
            ["background-color", "var(--tempest-bg)"],
            ["color", "var(--tempest-text)"],
        ]),
        block(`:where(:is(${page.darkSelector}) ${DEFAULT_TONE_SELECTOR})`, [
            ["color-scheme", "dark"],
        ]),
    ].join("\n\n");
}
