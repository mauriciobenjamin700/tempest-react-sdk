import { isDevBuild } from "@/utils/dev-mode";

/**
 * The largest numeric `gap` accepted without a development warning: `12`, i.e.
 * 48px on the 4px scale.
 *
 * Chosen from the SDK's own spacing, not from the issue's guess (#536 proposed
 * `> 16`). Measured on 2026-11-01:
 *
 * - the `tempest-gap-*` utility classes stop at `12` (`--tempest-space-12`);
 * - no stylesheet in `src/` sets `gap` above `--tempest-space-12`;
 * - every literal numeric `gap` in `src/`, `docs/`, `examples/gallery/src`,
 *   `template/` and `template-pwa/` is `8` or lower (`grep -rhoE "gap=\{[^}]*\}+"`
 *   over those trees: 125 uses, highest value `8`).
 *
 * So nothing the SDK ships or documents crosses it, while the pixel-looking
 * values that do — `16`, `20`, `24`, the gaps a CSS reader writes by reflex —
 * are exactly the ones the issue reported (`gap={24}` became 96px). `> 16`
 * would have let `gap={16}`, the most common pixel gap there is, through as a
 * silent 64px.
 */
export const GAP_SCALE_MAX = 12;

const warnedGaps = new Set<number>();

/**
 * Warn once per value that a numeric `gap` above {@link GAP_SCALE_MAX} was
 * probably meant as pixels.
 *
 * Once per value, because layout components re-render constantly and a warning
 * per render would bury the console; the set is never cleared, since a literal
 * in the source does not change within the life of the page. Keyed by value and
 * not by component: the mistake is the number, wherever it is written.
 *
 * @param component - The component whose prop carried the value, for the message.
 * @param gap - The numeric gap as written.
 */
function warnPixelLikeGap(component: string, gap: number): void {
    if (warnedGaps.has(gap)) return;
    warnedGaps.add(gap);
    const pixels = gap * 4;
    const scaleHint = gap % 4 === 0 ? ` For ${gap}px use gap={${gap / 4}}.` : "";
    console.warn(
        `[tempest-react-sdk] <${component} gap={${gap}}> renders a ${pixels}px gap: ` +
            `numeric gap counts 4px steps, not pixels.${scaleHint} ` +
            `For ${pixels}px on purpose, pass gap="${pixels}px".`,
    );
}

/**
 * Turn a `gap` prop into the CSS `gap` value shared by `Stack`, `Grid`, `Form`,
 * `FormSection`, `FormRow` and `FormActions`.
 *
 * A number is a step on the 4px scale (`6` → `24px`); a string passes through as
 * any CSS length. The number reads as pixels to anyone coming from CSS or from
 * React's `style={{ gap: 24 }}`, so in a development build a value above
 * {@link GAP_SCALE_MAX} logs a one-time warning naming both readings. Production
 * builds stay silent: the gate is `isDevBuild()`, the SDK's single answer to
 * that question.
 *
 * @param component - The component name, used only in the warning.
 * @param gap - The prop value, a scale step or a CSS length.
 * @returns The CSS `gap` value.
 */
export function resolveGap(component: string, gap: number | string): string {
    if (typeof gap === "string") return gap;
    if (gap > GAP_SCALE_MAX && isDevBuild()) warnPixelLikeGap(component, gap);
    return `${gap * 4}px`;
}
