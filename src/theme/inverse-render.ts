/**
 * The small, always-loaded half of the inverse surface: its types, its default
 * selector and the CSS renderer. The generator lives in `inverse-surface.ts`,
 * which only an app that asks for it imports.
 */
import type { ScaleStep } from "./color";
import type { ThemeStatus } from "./status-tokens";

/** Default selector the inverse tokens are written under. */
export const INVERSE_SELECTOR = '[data-tempest-tone="inverse"]';

/** Which way the inverse surface reads: light ink on a dark fill, or the reverse. */
export type InverseScheme = "light" | "dark";

/** The inverse surface for one brand. */
export interface InverseSurface {
    /** Every color custom property the surface redefines, as literal colors. */
    tokens: Record<string, string>;
    /**
     * `"dark"` when the fill carries light ink (a navy brand), `"light"` when it
     * carries dark ink (a yellow brand). Written as `color-scheme`, so native
     * controls inside the section follow the fill rather than the page.
     */
    scheme: InverseScheme;
    /** Step of the brand's light ramp used as the fill. */
    step: ScaleStep;
}

/** Input for an {@link InverseSurfaceGenerator} — `createInverseSurface`. */
export interface InverseSurfaceOptions {
    /** Brand color — the fill is picked from its ramp. */
    primary: string;
    /**
     * Status colors the theme names; the rest use the SDK's defaults. A named
     * `danger` is also the warm pole of the diverging chart scale, as on the page.
     */
    statuses?: Partial<Record<ThemeStatus, string>>;
    /** Categorical chart colors the theme names; else the SDK's defaults. */
    chart?: readonly string[];
}

/**
 * The inverse-surface generator `createTheme` calls when it is handed one —
 * in practice `createInverseSurface`.
 *
 * A function rather than a flag on purpose: `createTheme` never imports the
 * generator, so an app that does not paint a section in its brand does not ship
 * it. Measured with `npx size-limit`, `{ createTheme }` is 3.18 kB brotli on its
 * own and 4.86 kB with the generator inside it — what a boolean option would
 * have charged every theme.
 */
export type InverseSurfaceGenerator = (options: InverseSurfaceOptions) => InverseSurface;

/**
 * Render the inverse surface as CSS: the token block, plus a zero-specificity
 * rule that paints the fill and the ink on the element itself.
 *
 * The paint rule is what makes the attribute a complete shortcut — without it a
 * `<section data-tempest-tone="inverse">` would get inverted tokens and keep the
 * page's background, which is white text on white. It goes through `:where()`
 * so any background the app sets on the same element wins without a fight.
 *
 * @param selector - Selector the surface is scoped to.
 * @param surface - The surface an {@link InverseSurfaceGenerator} returned.
 * @returns The CSS text.
 */
export function renderInverseSurface(selector: string, surface: InverseSurface): string {
    const body = Object.entries(surface.tokens)
        .map(([name, value]) => `    ${name}: ${value};`)
        .join("\n");
    return (
        `${selector} {\n    color-scheme: ${surface.scheme};\n${body}\n}\n\n` +
        `:where(${selector}) {\n    background-color: var(--tempest-bg);\n    color: var(--tempest-text);\n}`
    );
}
