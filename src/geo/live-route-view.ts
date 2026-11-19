import { projectMercator, unprojectMercator, type PixelPoint } from "./projection";
import type { Coordinate, GeoBounds } from "./types";

/**
 * What the live map is looking at: a center on the unit Web Mercator plane and a
 * uniform scale (pixels per unit of that plane).
 *
 * Kept center-based on purpose. A bounds-based view (what `fitProjection` builds)
 * has to be refit to move, and every refit can change the zoom, which is the
 * "map zooms out on every GPS fix" defect the follow mode exists to avoid. A
 * center plus a scale pans without touching the zoom and survives a container
 * resize unchanged.
 */
export interface LiveMapView {
    /** Center on the unit Web Mercator plane, `x` growing east, in `[0, 1]`. */
    centerX: number;
    /** Center on the unit Web Mercator plane, `y` growing south, in `[0, 1]`. */
    centerY: number;
    /** Pixels per unit of the Mercator plane. Zoom level `z` is `scale = 256 * 2^z`. */
    scale: number;
}

/** Viewport the view is rendered into, in CSS pixels. */
export interface LiveMapViewport {
    width: number;
    height: number;
}

/**
 * Everything the view resolver remembers between renders.
 *
 * `fitted` is the auto-fit the current view started from, so a new fit (route
 * changed, container resized) is told apart from a new vehicle position.
 * `detached` is true from the moment the user drags the map until they ask to
 * recenter, and while it holds no input moves the view.
 */
export interface LiveViewState {
    view: LiveMapView | null;
    fitted: LiveMapView | null;
    detached: boolean;
}

/** Inputs the view resolver reacts to on every render. */
export interface LiveViewInput {
    /** Auto-fit of the planned geometry for the current viewport, or `null`. */
    fitted: LiveMapView | null;
    /** Vehicle position to keep in sight, when follow is on and there is a vehicle. */
    target: Coordinate | null;
    viewport: LiveMapViewport;
    /** Fraction of each side the vehicle may enter before the map pans. Default: `0.2`. */
    margin?: number;
}

/** Initial state of the resolver: nothing fitted, nothing dragged. */
export const INITIAL_LIVE_VIEW_STATE: LiveViewState = { view: null, fitted: null, detached: false };

/** Largest zoom the fit settles on, so a single point does not zoom to street level and beyond. */
export const LIVE_MAP_MAX_FIT_ZOOM = 17;

/**
 * Fit `bounds` into the viewport, keeping `padding` pixels clear on every edge.
 *
 * The scale is capped at {@link LIVE_MAP_MAX_FIT_ZOOM}: a route of one point, or
 * a vehicle alone, has a zero-span box whose "fit" is infinite zoom.
 *
 * @param bounds - Geographic extent to fit, or `null` when there is nothing to show.
 * @param viewport - Viewport size in pixels.
 * @param padding - Inner margin in pixels.
 * @returns The fitted view, or `null` when `bounds` is `null`.
 */
export function fitLiveView(
    bounds: GeoBounds | null,
    viewport: LiveMapViewport,
    padding: number,
): LiveMapView | null {
    if (!bounds) return null;
    const topLeft = projectMercator({
        latitude: bounds.maxLatitude,
        longitude: bounds.minLongitude,
    });
    const bottomRight = projectMercator({
        latitude: bounds.minLatitude,
        longitude: bounds.maxLongitude,
    });
    const spanX = bottomRight.x - topLeft.x || Number.EPSILON;
    const spanY = bottomRight.y - topLeft.y || Number.EPSILON;
    const innerWidth = Math.max(1, viewport.width - padding * 2);
    const innerHeight = Math.max(1, viewport.height - padding * 2);
    const scale = Math.min(
        innerWidth / spanX,
        innerHeight / spanY,
        256 * 2 ** LIVE_MAP_MAX_FIT_ZOOM,
    );
    return {
        centerX: (topLeft.x + bottomRight.x) / 2,
        centerY: (topLeft.y + bottomRight.y) / 2,
        scale,
    };
}

/**
 * Project a coordinate into viewport pixels under `view`.
 *
 * @param view - The current view.
 * @param viewport - Viewport size in pixels.
 * @param coord - Coordinate to project.
 * @returns The pixel position, which may fall outside the viewport.
 */
export function projectLive(
    view: LiveMapView,
    viewport: LiveMapViewport,
    coord: Coordinate,
): PixelPoint {
    const point = projectMercator(coord);
    return {
        x: viewport.width / 2 + (point.x - view.centerX) * view.scale,
        y: viewport.height / 2 + (point.y - view.centerY) * view.scale,
    };
}

/**
 * Move the view by a pixel delta, the way a drag moves the map under the finger.
 *
 * @param view - The current view.
 * @param dx - Horizontal drag in pixels (positive = finger moved right).
 * @param dy - Vertical drag in pixels (positive = finger moved down).
 * @returns The panned view, at the same scale.
 */
export function panLiveView(view: LiveMapView, dx: number, dy: number): LiveMapView {
    return {
        centerX: view.centerX - dx / view.scale,
        centerY: Math.min(1, Math.max(0, view.centerY - dy / view.scale)),
        scale: view.scale,
    };
}

/**
 * Keep `target` in sight without changing the zoom.
 *
 * While the target stays inside the inner box (the viewport minus `margin` of
 * each side) the very same view object comes back, so a new GPS fix inside the
 * screen moves only the vehicle, never the map. When it leaves that box the map
 * recenters on it at the same scale. Recentering instead of nudging by the
 * overshoot means one pan per many fixes rather than a pan on every fix.
 *
 * @param view - The current view.
 * @param viewport - Viewport size in pixels.
 * @param target - Coordinate to keep visible.
 * @param margin - Fraction of each side the target may enter before panning. Default: `0.2`.
 * @returns `view` itself when no pan is needed, otherwise a view centered on `target`.
 */
export function followLiveView(
    view: LiveMapView,
    viewport: LiveMapViewport,
    target: Coordinate,
    margin = 0.2,
): LiveMapView {
    const pixel = projectLive(view, viewport, target);
    const insideX = pixel.x >= viewport.width * margin && pixel.x <= viewport.width * (1 - margin);
    const insideY =
        pixel.y >= viewport.height * margin && pixel.y <= viewport.height * (1 - margin);
    if (insideX && insideY) return view;
    return centerLiveView(view, target);
}

/**
 * Center the view on `target`, keeping the scale.
 *
 * @param view - The current view.
 * @param target - Coordinate to center on.
 * @returns A view centered on `target`.
 */
export function centerLiveView(view: LiveMapView, target: Coordinate): LiveMapView {
    const point = projectMercator(target);
    return { centerX: point.x, centerY: point.y, scale: view.scale };
}

/** True when two views are the same within floating-point noise. */
function sameView(a: LiveMapView | null, b: LiveMapView | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
        Math.abs(a.centerX - b.centerX) < 1e-12 &&
        Math.abs(a.centerY - b.centerY) < 1e-12 &&
        Math.abs(a.scale - b.scale) <= a.scale * 1e-9
    );
}

/**
 * Decide the view for this render. This is the whole framing policy of the live
 * map, as a pure function so it is tested without a DOM.
 *
 * - A **new fit** (the planned geometry or the viewport changed) replaces the
 *   view, then the follow rule applies on top of it.
 * - A **new vehicle position** with follow on only pans, and only when the
 *   vehicle left the inner box ({@link followLiveView}); it never refits, so the
 *   zoom the user is looking at survives every fix.
 * - While **detached** (the user dragged the map) nothing moves the view; the
 *   new fit is remembered for when the user recenters.
 *
 * Returns `prev` itself when nothing changed, which is what lets the component
 * call it during render and update state only on a real change.
 *
 * @param prev - State from the previous render.
 * @param input - This render's fit, follow target and viewport.
 * @returns The next state, or `prev` when it is unchanged.
 */
export function resolveLiveView(prev: LiveViewState, input: LiveViewInput): LiveViewState {
    const { fitted, target, viewport, margin } = input;
    const refit = !sameView(prev.fitted, fitted);
    if (prev.detached) {
        return refit ? { ...prev, fitted } : prev;
    }
    const base = refit || !prev.view ? fitted : prev.view;
    const view = base && target ? followLiveView(base, viewport, target, margin) : base;
    if (!refit && sameView(view, prev.view)) return prev;
    return { view, fitted, detached: false };
}

/**
 * Mark the view as moved by the user, so follow stops until a recenter.
 *
 * @param prev - Current state.
 * @param view - The view after the user's drag.
 * @returns The detached state.
 */
export function detachLiveView(prev: LiveViewState, view: LiveMapView): LiveViewState {
    return { ...prev, view, detached: true };
}

/**
 * Answer the "recenter" button: back to following.
 *
 * With a vehicle the map centers on it at the zoom the user left it; without
 * one it returns to the auto-fit of the planned geometry.
 *
 * @param prev - Current state.
 * @param target - The vehicle position, or `null` when there is none.
 * @returns The attached state.
 */
export function recenterLiveView(prev: LiveViewState, target: Coordinate | null): LiveViewState {
    const view =
        target && prev.view ? centerLiveView(prev.view, target) : (prev.fitted ?? prev.view);
    return { view, fitted: prev.fitted, detached: false };
}

/**
 * Linear interpolation between two coordinates.
 *
 * Linear in degrees is exact enough for the few meters a vehicle moves between
 * two fixes; it only drifts over hundreds of kilometers.
 *
 * @param from - Start coordinate.
 * @param to - End coordinate.
 * @param t - Progress in `[0, 1]`.
 * @returns The coordinate at `t`.
 */
export function interpolateCoordinate(from: Coordinate, to: Coordinate, t: number): Coordinate {
    return {
        latitude: from.latitude + (to.latitude - from.latitude) * t,
        longitude: from.longitude + (to.longitude - from.longitude) * t,
    };
}

/**
 * Interpolate a compass heading along the shortest arc, so `350° → 10°` turns
 * 20° clockwise instead of 340° counter-clockwise.
 *
 * @param from - Start heading in degrees.
 * @param to - End heading in degrees.
 * @param t - Progress in `[0, 1]`.
 * @returns The heading at `t`, normalized to `[0, 360)`.
 */
export function interpolateHeading(from: number, to: number, t: number): number {
    const delta = ((((to - from) % 360) + 540) % 360) - 180;
    return (((from + delta * t) % 360) + 360) % 360;
}

/** One map tile placed in viewport pixels. */
export interface PlacedTile {
    /** Tile URL with `{z}`, `{x}` and `{y}` filled in. */
    url: string;
    /** Left edge in viewport pixels. */
    x: number;
    /** Top edge in viewport pixels. */
    y: number;
    /** Edge length in pixels (tiles are square). */
    size: number;
}

/**
 * Tiles covering the viewport under `view`, from a `{z}/{x}/{y}` template.
 *
 * The zoom is the integer closest to the view's scale, and each tile is drawn at
 * the exact size that scale implies, so the tiles and the SVG overlay share one
 * projection and stay aligned at any scale. Columns wrap around the
 * antimeridian; rows outside the world are skipped.
 *
 * @param view - The current view.
 * @param viewport - Viewport size in pixels.
 * @param template - URL template with `{z}`, `{x}`, `{y}` placeholders.
 * @param maxZoom - Highest zoom the tile server has. Default: `19`.
 * @returns The tiles to draw, row by row.
 */
export function tilesForView(
    view: LiveMapView,
    viewport: LiveMapViewport,
    template: string,
    maxZoom = 19,
): PlacedTile[] {
    const zoom = Math.min(maxZoom, Math.max(0, Math.round(Math.log2(view.scale / 256))));
    const count = 2 ** zoom;
    const size = view.scale / count;
    const left = view.centerX - viewport.width / 2 / view.scale;
    const top = view.centerY - viewport.height / 2 / view.scale;
    const firstColumn = Math.floor(left * count);
    const lastColumn = Math.floor((left + viewport.width / view.scale) * count);
    const firstRow = Math.max(0, Math.floor(top * count));
    const lastRow = Math.min(count - 1, Math.floor((top + viewport.height / view.scale) * count));
    const tiles: PlacedTile[] = [];
    for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
            const wrapped = ((column % count) + count) % count;
            tiles.push({
                url: template
                    .replace("{z}", String(zoom))
                    .replace("{x}", String(wrapped))
                    .replace("{y}", String(row)),
                x: (column / count - left) * view.scale,
                y: (row / count - top) * view.scale,
                size,
            });
        }
    }
    return tiles;
}

/** Equatorial circumference of the WGS84 ellipsoid, in kilometers. */
const EARTH_CIRCUMFERENCE_KM = 40075.016686;

/**
 * Ground distance one pixel covers at the view's center.
 *
 * @param view - The current view.
 * @returns Kilometers per pixel.
 */
export function kmPerPixel(view: LiveMapView): number {
    const center = unprojectMercator({ x: view.centerX, y: view.centerY });
    return (EARTH_CIRCUMFERENCE_KM * Math.cos((center.latitude * Math.PI) / 180)) / view.scale;
}

/** Where a marker's content panel sits relative to its marker. */
export interface PopoverPlacement {
    /** Horizontal anchor in viewport pixels, clamped so the panel stays inside. */
    left: number;
    /** Vertical anchor in viewport pixels (the marker's `y`). */
    top: number;
    /** `"above"` normally; `"below"` when the marker is too close to the top edge. */
    side: "above" | "below";
}

/**
 * Place a marker's content panel so it stays inside the map.
 *
 * jsdom has no layout, so the panel's real size is unknown in tests and on the
 * first paint; the placement works from the panel's maximum width instead and
 * lets CSS cap the panel at it.
 *
 * @param anchor - Marker position in viewport pixels.
 * @param viewport - Viewport size in pixels.
 * @param panelWidth - Maximum panel width in pixels.
 * @param clearance - Space the panel needs above the marker. Default: `120`.
 * @returns The anchor and side to render the panel at.
 */
export function placePopover(
    anchor: PixelPoint,
    viewport: LiveMapViewport,
    panelWidth: number,
    clearance = 120,
): PopoverPlacement {
    const half = Math.min(panelWidth, viewport.width - 16) / 2;
    const left = Math.min(Math.max(anchor.x, half + 8), viewport.width - half - 8);
    return { left, top: anchor.y, side: anchor.y < clearance ? "below" : "above" };
}
