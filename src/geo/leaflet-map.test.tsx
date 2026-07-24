import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Coordinate } from "./types";

const leaflet = vi.hoisted(() => {
    const addTo = vi.fn();
    const layer = { addTo };
    return {
        addTo,
        setView: vi.fn(),
        fitBounds: vi.fn(),
        remove: vi.fn(),
        map: vi.fn(),
        tileLayer: vi.fn(() => layer),
        polyline: vi.fn(() => layer),
        circleMarker: vi.fn(() => layer),
        /** Set when the module is imported as a namespace rather than a default. */
        useNamespaceShape: { value: false },
    };
});

vi.mock("leaflet", () => {
    const api = {
        map: leaflet.map,
        tileLayer: leaflet.tileLayer,
        polyline: leaflet.polyline,
        circleMarker: leaflet.circleMarker,
    };
    return leaflet.useNamespaceShape.value ? api : { default: api };
});

const { LeafletTrajectory } = await import("./leaflet-map");

const POINTS: Coordinate[] = [
    { latitude: -23.55, longitude: -46.63 },
    { latitude: -23.56, longitude: -46.64 },
];

/**
 * Wait until the component's dynamic `import("leaflet")` has resolved and the
 * map was built.
 *
 * Module loading takes an unpredictable number of ticks — draining a fixed
 * count of macrotasks passed alone and failed under full-suite load — so this
 * polls for the observable effect instead.
 */
async function settled(): Promise<void> {
    await vi.waitFor(() => expect(leaflet.map).toHaveBeenCalled());
}

/** Drain a few macrotasks without requiring the import to have resolved. */
async function flush(): Promise<void> {
    for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    leaflet.map.mockReturnValue({
        setView: leaflet.setView,
        fitBounds: leaflet.fitBounds,
        remove: leaflet.remove,
    });
});

describe("LeafletTrajectory", () => {
    it("creates the map, tile layer, track and markers", async () => {
        render(<LeafletTrajectory points={POINTS} tileUrl="https://t/{z}/{x}/{y}.png" />);
        await settled();

        expect(leaflet.map).toHaveBeenCalledTimes(1);
        expect(leaflet.tileLayer).toHaveBeenCalledWith(
            "https://t/{z}/{x}/{y}.png",
            expect.objectContaining({ attribution: "", maxZoom: 19 }),
        );
        expect(leaflet.polyline).toHaveBeenCalledWith(
            [
                [-23.55, -46.63],
                [-23.56, -46.64],
            ],
            expect.objectContaining({ color: "#2563eb", weight: 4 }),
        );
        expect(leaflet.circleMarker).toHaveBeenCalledTimes(2);
        expect(leaflet.fitBounds).toHaveBeenCalled();
    });

    it("passes the attribution and stroke colour through", async () => {
        render(
            <LeafletTrajectory
                points={POINTS}
                tileUrl="https://t/{z}/{x}/{y}.png"
                tileAttribution="© Tempest"
                strokeColor="#ff0000"
            />,
        );
        await settled();

        expect(leaflet.tileLayer).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ attribution: "© Tempest" }),
        );
        expect(leaflet.polyline).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ color: "#ff0000" }),
        );
    });

    it("marks `current` instead of the last point when given", async () => {
        const current: Coordinate = { latitude: -10, longitude: -20 };
        render(
            <LeafletTrajectory points={POINTS} current={current} tileUrl="https://t/{z}/{x}/{y}" />,
        );
        await settled();

        expect(leaflet.circleMarker).toHaveBeenCalledWith(
            [-10, -20],
            expect.objectContaining({ radius: 6 }),
        );
    });

    it("falls back to a world view with no points at all", async () => {
        render(<LeafletTrajectory points={[]} tileUrl="https://t/{z}/{x}/{y}" />);
        await settled();

        expect(leaflet.polyline).not.toHaveBeenCalled();
        expect(leaflet.setView).toHaveBeenCalledWith([0, 0], 2);
        expect(leaflet.fitBounds).not.toHaveBeenCalled();
    });

    it("still draws a marker for a single point", async () => {
        render(<LeafletTrajectory points={[POINTS[0]]} tileUrl="https://t/{z}/{x}/{y}" />);
        await settled();

        expect(leaflet.polyline).toHaveBeenCalled();
        expect(leaflet.fitBounds).toHaveBeenCalled();
    });

    it("treats a null `current` as absent", async () => {
        render(
            <LeafletTrajectory points={POINTS} current={null} tileUrl="https://t/{z}/{x}/{y}" />,
        );
        await settled();

        expect(leaflet.circleMarker).toHaveBeenLastCalledWith(
            [-23.56, -46.64],
            expect.objectContaining({ radius: 6 }),
        );
    });

    it("removes the map on unmount", async () => {
        const { unmount } = render(
            <LeafletTrajectory points={POINTS} tileUrl="https://t/{z}/{x}/{y}" />,
        );
        await settled();
        unmount();
        expect(leaflet.remove).toHaveBeenCalled();
    });

    it("does nothing when unmounted before leaflet resolves", async () => {
        const { unmount } = render(
            <LeafletTrajectory points={POINTS} tileUrl="https://t/{z}/{x}/{y}" />,
        );
        unmount();
        await flush();
        expect(leaflet.map).not.toHaveBeenCalled();
    });

    it("accepts a namespace-shaped module without a default export", async () => {
        leaflet.useNamespaceShape.value = true;
        vi.resetModules();
        const { LeafletTrajectory: Fresh } = await import("./leaflet-map");
        render(<Fresh points={POINTS} tileUrl="https://t/{z}/{x}/{y}" />);
        await settled();
        expect(leaflet.map).toHaveBeenCalled();
        leaflet.useNamespaceShape.value = false;
    });
});
