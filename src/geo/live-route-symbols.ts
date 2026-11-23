import type { CSSProperties, ReactNode } from "react";
import type { LiveRouteMarker, LiveRouteMarkerKind } from "./LiveRouteMap";

/** Half the size of each kind's shape at scale 1, in px: the circle radius, or half the square. */
const MARKER_HALF_SIZE: Record<LiveRouteMarkerKind, number> = {
    origin: 10,
    stop: 8,
    destination: 9,
};

/**
 * Smallest half size of a glyph that carries `glyphText` or an `icon`. A stop is
 * 16 px wide, and two digits of bold text in it come out under 10 px; at 10 the
 * glyph is 20 px and the text 12 px.
 */
const CONTENT_HALF_SIZE = 10;

/** How much `emphasis` grows the shape before the halo is drawn around it. */
export const EMPHASIS_FACTOR = 1.4;

/** Width of the emphasis halo around the grown shape, in px. */
const EMPHASIS_HALO = 6;

/**
 * Radius of the invisible circle that takes the pointer, in screen px, never
 * scaled down by `markerScale`.
 *
 * Measured in Chromium on the 0.91.0 gallery (`elementFromPoint` at 16
 * directions every 2 px): a stop answered only inside its 16 px disc, then the
 * badge corner, then a 3 px ring at r 16 painted by the transparent focus-ring
 * stroke — nothing past 24 px. WCAG 2.2 asks 24 px (SC 2.5.8) and 44 px for the
 * enhanced level (SC 2.5.5); the map is a touch surface for drivers, so the hit
 * area is 44 px across whatever the drawn size.
 */
export const MARKER_HIT_RADIUS = 22;

/** Geometry of one marker glyph at scale 1, derived from its kind and options. */
export interface MarkerGeometry {
    /** Half the size of the shape (circle radius or half the square). */
    half: number;
    /** Outer radius of the emphasis halo, or `half` without emphasis. */
    outer: number;
    /** Radius of the keyboard focus ring. */
    focus: number;
}

/**
 * Size a marker glyph. `glyphText` and `icon` grow a small shape to
 * `CONTENT_HALF_SIZE` so the content fits; `emphasis` grows it by
 * `EMPHASIS_FACTOR` and adds a halo; the focus ring always clears both.
 *
 * @param kind - The marker kind.
 * @param emphasis - Whether the marker is emphasized.
 * @param hasContent - Whether `glyphText` or `icon` is drawn inside.
 * @returns The half size, the outer radius and the focus ring radius.
 */
export function markerGeometry(
    kind: LiveRouteMarkerKind,
    emphasis: boolean,
    hasContent: boolean,
): MarkerGeometry {
    const base = hasContent
        ? Math.max(MARKER_HALF_SIZE[kind], CONTENT_HALF_SIZE)
        : MARKER_HALF_SIZE[kind];
    const half = emphasis ? base * EMPHASIS_FACTOR : base;
    const outer = emphasis ? half + EMPHASIS_HALO : half;
    return { half, outer, focus: Math.max(16, outer + 4) };
}

/**
 * Turn `markerScale` into a usable factor: anything not finite and positive is 1.
 *
 * @param scale - The value the app passed.
 * @returns The factor applied to the glyph geometry.
 */
export function resolveMarkerScale(scale: number | undefined): number {
    return scale !== undefined && Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * Whether a marker draws content inside its shape.
 *
 * @param glyphText - The marker's `glyphText`; an empty string draws nothing.
 * @param icon - The marker's `icon`; `null`, `false` and `undefined` draw nothing.
 * @returns `true` when the shape carries text or an icon.
 */
export function hasInnerMark(glyphText: string | undefined, icon: ReactNode): boolean {
    return (
        (glyphText !== undefined && glyphText !== "") ||
        (icon !== undefined && icon !== null && icon !== false)
    );
}

/**
 * The text of a count badge: the number, or `"99+"` past 99 so the pill keeps
 * a width the marker corner can hold.
 *
 * @param count - The count the app passed.
 * @returns The text drawn in the pill and appended to the accessible name.
 */
export function formatBadge(count: number): string {
    return count > 99 ? "99+" : String(count);
}

/**
 * Half the width of the badge pill for a count, in px at scale 1.
 *
 * @param count - The count the app passed.
 * @returns Half the pill width: 9 for one character, more for two or `"99+"`.
 */
export function badgeHalfWidth(count: number): number {
    const length = formatBadge(count).length;
    return length > 1 ? 4 + length * 3.5 : 9;
}

/**
 * Gap between a marker and its panel, in px, so the panel clears the drawn
 * glyph at any `markerScale` and emphasis. 18 px at scale 1, as before.
 *
 * @param marker - The open marker.
 * @param scale - The resolved `markerScale`.
 * @returns The inline style that sets `--tempest-live-route-panel-gap`.
 */
export function panelGapStyle(marker: LiveRouteMarker, scale: number): CSSProperties {
    const kind = marker.kind ?? "stop";
    const hasInner = hasInnerMark(marker.glyphText, marker.icon);
    const { focus } = markerGeometry(kind, marker.emphasis === true, hasInner);
    return {
        ["--tempest-live-route-panel-gap" as string]: `${((focus + 2) * scale).toFixed(1)}px`,
    };
}
