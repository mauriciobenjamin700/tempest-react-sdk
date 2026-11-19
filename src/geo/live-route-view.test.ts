import { describe, expect, it } from "vitest";
import { boundingBox } from "./bounds";
import {
    INITIAL_LIVE_VIEW_STATE,
    LIVE_MAP_MAX_FIT_ZOOM,
    centerLiveView,
    detachLiveView,
    fitLiveView,
    followLiveView,
    interpolateCoordinate,
    interpolateHeading,
    kmPerPixel,
    panLiveView,
    placePopover,
    projectLive,
    recenterLiveView,
    resolveLiveView,
    tilesForView,
    type LiveMapView,
    type LiveViewState,
} from "./live-route-view";
import { formatScale, pickScaleKm } from "./scale";
import type { Coordinate } from "./types";

const VIEWPORT = { width: 400, height: 300 };
const ROUTE: Coordinate[] = [
    { latitude: -23.55, longitude: -46.64 },
    { latitude: -23.56, longitude: -46.63 },
    { latitude: -23.57, longitude: -46.62 },
];

function fitted(): LiveMapView {
    const view = fitLiveView(boundingBox(ROUTE), VIEWPORT, 24);
    if (!view) throw new Error("expected a fit");
    return view;
}

describe("fitLiveView", () => {
    it("returns null when there is nothing to frame", () => {
        expect(fitLiveView(null, VIEWPORT, 24)).toBeNull();
    });

    it("keeps every planned point inside the padded viewport", () => {
        const view = fitted();
        for (const point of ROUTE) {
            const p = projectLive(view, VIEWPORT, point);
            expect(p.x).toBeGreaterThanOrEqual(24 - 1e-6);
            expect(p.x).toBeLessThanOrEqual(VIEWPORT.width - 24 + 1e-6);
            expect(p.y).toBeGreaterThanOrEqual(24 - 1e-6);
            expect(p.y).toBeLessThanOrEqual(VIEWPORT.height - 24 + 1e-6);
        }
    });

    it("caps the zoom for a single point instead of zooming in forever", () => {
        const view = fitLiveView(boundingBox([ROUTE[0]]), VIEWPORT, 24);
        expect(view?.scale).toBe(256 * 2 ** LIVE_MAP_MAX_FIT_ZOOM);
    });
});

describe("followLiveView", () => {
    it("returns the very same view while the vehicle stays inside the inner box", () => {
        const view = fitted();
        expect(followLiveView(view, VIEWPORT, ROUTE[1])).toBe(view);
    });

    it("recenters on the vehicle at the same scale once it nears an edge", () => {
        const view = fitted();
        const far: Coordinate = { latitude: -23.6, longitude: -46.58 };
        const next = followLiveView(view, VIEWPORT, far);
        expect(next).not.toBe(view);
        expect(next.scale).toBe(view.scale);
        const p = projectLive(next, VIEWPORT, far);
        expect(p.x).toBeCloseTo(VIEWPORT.width / 2, 6);
        expect(p.y).toBeCloseTo(VIEWPORT.height / 2, 6);
    });
});

describe("panLiveView", () => {
    it("moves the map under the finger without changing the zoom", () => {
        const view = fitted();
        const before = projectLive(view, VIEWPORT, ROUTE[0]);
        const panned = panLiveView(view, 30, -20);
        const after = projectLive(panned, VIEWPORT, ROUTE[0]);
        expect(panned.scale).toBe(view.scale);
        expect(after.x - before.x).toBeCloseTo(30, 6);
        expect(after.y - before.y).toBeCloseTo(-20, 6);
    });
});

describe("resolveLiveView — the framing policy", () => {
    function settle(state: LiveViewState, target: Coordinate | null): LiveViewState {
        return resolveLiveView(state, { fitted: fitted(), target, viewport: VIEWPORT });
    }

    it("starts from the fit of the planned geometry", () => {
        const state = settle(INITIAL_LIVE_VIEW_STATE, null);
        expect(state.view).toEqual(fitted());
        expect(state.detached).toBe(false);
    });

    it("returns the same state object when nothing changed, so render does not loop", () => {
        const state = settle(INITIAL_LIVE_VIEW_STATE, ROUTE[1]);
        expect(settle(state, ROUTE[1])).toBe(state);
    });

    it("does not reframe the map for a new vehicle position inside the screen", () => {
        const state = settle(INITIAL_LIVE_VIEW_STATE, ROUTE[1]);
        const next = settle(state, { latitude: -23.562, longitude: -46.628 });
        expect(next).toBe(state);
    });

    it("pans at the same zoom when the vehicle leaves the inner box — never zooms out", () => {
        const state = settle(INITIAL_LIVE_VIEW_STATE, ROUTE[0]);
        const far: Coordinate = { latitude: -23.62, longitude: -46.55 };
        const next = settle(state, far);
        expect(next.view?.scale).toBe(state.view?.scale);
        const p = projectLive(next.view as LiveMapView, VIEWPORT, far);
        expect(p.x).toBeCloseTo(VIEWPORT.width / 2, 6);
    });

    it("leaves the view alone after a drag, whatever the vehicle does", () => {
        const start = settle(INITIAL_LIVE_VIEW_STATE, ROUTE[0]);
        const dragged = detachLiveView(start, panLiveView(start.view as LiveMapView, 120, 0));
        const far: Coordinate = { latitude: -23.62, longitude: -46.55 };
        expect(settle(dragged, far)).toBe(dragged);
    });

    it("remembers a new fit while detached, without applying it", () => {
        const start = settle(INITIAL_LIVE_VIEW_STATE, null);
        const dragged = detachLiveView(start, panLiveView(start.view as LiveMapView, 50, 0));
        const wider = fitLiveView(boundingBox(ROUTE), { width: 800, height: 300 }, 24);
        const next = resolveLiveView(dragged, {
            fitted: wider,
            target: null,
            viewport: { width: 800, height: 300 },
        });
        expect(next.view).toBe(dragged.view);
        expect(next.fitted).toEqual(wider);
    });

    it("refits when the planned geometry or the viewport changes", () => {
        const start = settle(INITIAL_LIVE_VIEW_STATE, null);
        const longer = [...ROUTE, { latitude: -23.7, longitude: -46.5 }];
        const wider = fitLiveView(boundingBox(longer), VIEWPORT, 24);
        const next = resolveLiveView(start, { fitted: wider, target: null, viewport: VIEWPORT });
        expect(next.view).toEqual(wider);
        expect(next.view).not.toEqual(start.view);
    });

    it("recenter goes back to the vehicle at the user's zoom, and re-attaches", () => {
        const start = settle(INITIAL_LIVE_VIEW_STATE, ROUTE[0]);
        const dragged = detachLiveView(start, panLiveView(start.view as LiveMapView, 200, 0));
        const back = recenterLiveView(dragged, ROUTE[2]);
        expect(back.detached).toBe(false);
        expect(back.view).toEqual(centerLiveView(dragged.view as LiveMapView, ROUTE[2]));
    });

    it("recenter without a vehicle returns to the fit", () => {
        const start = settle(INITIAL_LIVE_VIEW_STATE, null);
        const dragged = detachLiveView(start, panLiveView(start.view as LiveMapView, 200, 0));
        expect(recenterLiveView(dragged, null).view).toEqual(start.fitted);
    });
});

describe("vehicle glide interpolation", () => {
    it("interpolates a coordinate linearly", () => {
        const mid = interpolateCoordinate(ROUTE[0], ROUTE[2], 0.5);
        expect(mid.latitude).toBeCloseTo(-23.56, 9);
        expect(mid.longitude).toBeCloseTo(-46.63, 9);
    });

    it("turns the short way across north", () => {
        expect(interpolateHeading(350, 10, 0.5)).toBeCloseTo(0, 9);
        expect(interpolateHeading(10, 350, 0.25)).toBeCloseTo(5, 9);
        expect(interpolateHeading(90, 270, 1)).toBeCloseTo(270, 9);
    });
});

describe("tilesForView", () => {
    it("covers the viewport with tiles of the zoom matching the scale", () => {
        const view: LiveMapView = { centerX: 0.5, centerY: 0.5, scale: 256 * 2 ** 3 };
        const tiles = tilesForView(view, { width: 512, height: 256 }, "https://t/{z}/{x}/{y}.png");
        expect(tiles.every((t) => t.url.startsWith("https://t/3/"))).toBe(true);
        expect(tiles.every((t) => t.size === 256)).toBe(true);
        expect(tiles).toHaveLength(3 * 2);
        expect(tiles[0]).toMatchObject({ url: "https://t/3/3/3.png", x: 0, y: -128 });
    });

    it("wraps columns across the antimeridian and never asks for rows outside the world", () => {
        const view: LiveMapView = { centerX: 0, centerY: 0, scale: 256 };
        const tiles = tilesForView(view, { width: 512, height: 512 }, "{z}/{x}/{y}");
        expect(tiles.map((t) => t.url)).toEqual(["0/0/0", "0/0/0", "0/0/0"]);
    });

    it("stops at the tile server's maximum zoom", () => {
        const view: LiveMapView = { centerX: 0.5, centerY: 0.5, scale: 256 * 2 ** 21 };
        const [tile] = tilesForView(view, VIEWPORT, "{z}/{x}/{y}", 19);
        expect(tile.url.startsWith("19/")).toBe(true);
        expect(tile.size).toBe(1024);
    });
});

describe("scale and popover helpers", () => {
    it("measures about 40 075 km across the whole world at the equator", () => {
        expect(kmPerPixel({ centerX: 0.5, centerY: 0.5, scale: 1 })).toBeCloseTo(40075.016686, 3);
    });

    it("rounds the scale bar to a readable distance", () => {
        expect(formatScale(pickScaleKm(0.01, 120).km)).toBe("1 km");
        expect(formatScale(0.25)).toBe("250 m");
        expect(formatScale(2.5)).toBe("2.5 km");
    });

    it("keeps the panel inside the map and flips it below near the top edge", () => {
        expect(placePopover({ x: 5, y: 200 }, VIEWPORT, 240)).toEqual({
            left: 128,
            top: 200,
            side: "above",
        });
        expect(placePopover({ x: 395, y: 40 }, VIEWPORT, 240).left).toBe(272);
        expect(placePopover({ x: 200, y: 40 }, VIEWPORT, 240).side).toBe("below");
        expect(placePopover({ x: 100, y: 200 }, { width: 200, height: 300 }, 240).left).toBe(100);
    });
});
