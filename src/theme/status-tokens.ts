/**
 * Status token families, shared by the page schemes {@link createTheme} emits and
 * by the inverse surface.
 */
import { readableForeground, type ColorScale } from "./color";

/** Status token families that {@link createTheme} can regenerate. */
export type ThemeStatus = "success" | "warning" | "danger" | "info";

/** The four status families, in the order they are emitted. */
export const THEME_STATUSES: readonly ThemeStatus[] = ["success", "warning", "danger", "info"];

/**
 * The dark ink for content sitting on a saturated fill.
 *
 * Near-black tinted toward warm rather than pure black, matching the value
 * `colors.css` uses for the same job: it reads as part of the swatch instead of
 * a hole punched in it.
 */
export const ON_SOLID_INK = "#1f0606";

/**
 * Emit one status family (`--tempest-danger`, `-fg`, `-bg`, `-border`, `-solid`).
 *
 * `-fg` is the text shade over `-bg`, so it has to cross the ramp in opposite
 * directions per scheme; `-solid` stays the saturated fill used by badges.
 *
 * `-on-solid` is derived from the `-solid` this call just emitted, rather than
 * left to fall through. Falling through was the bug: the SDK's own
 * `-on-solid` values are measured against the SDK's own fills, so a brand whose
 * `danger-600` lands light kept white ink over it and nothing said so. The
 * generated neutral hit exactly that — white over a generated `gray-700` of
 * `#a8b2c6` measures 2.13:1.
 *
 * @param tokens - The token map for this scheme, written in place.
 * @param name - Which status family.
 * @param scale - The generated ramp for that status, in the scheme's direction.
 * @param scheme - Which scheme is being emitted.
 */
export function writeStatus(
    tokens: Record<string, string>,
    name: ThemeStatus,
    scale: ColorScale,
    scheme: "light" | "dark",
): void {
    if (scheme === "light") {
        tokens[`--tempest-${name}`] = scale[700];
        tokens[`--tempest-${name}-fg`] = scale[800];
        tokens[`--tempest-${name}-bg`] = scale[50];
        tokens[`--tempest-${name}-border`] = scale[200];
        tokens[`--tempest-${name}-solid`] = scale[600];
        tokens[`--tempest-${name}-on-solid`] = readableForeground(
            scale[600],
            "#ffffff",
            ON_SOLID_INK,
        );
    } else {
        tokens[`--tempest-${name}`] = scale[700];
        tokens[`--tempest-${name}-fg`] = scale[700];
        tokens[`--tempest-${name}-bg`] = scale[50];
        tokens[`--tempest-${name}-border`] = scale[200];
        tokens[`--tempest-${name}-solid`] = scale[500];
        tokens[`--tempest-${name}-on-solid`] = readableForeground(
            scale[500],
            "#ffffff",
            ON_SOLID_INK,
        );
    }
}
