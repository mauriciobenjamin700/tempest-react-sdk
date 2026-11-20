import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { LiveRouteMap } from "./LiveRouteMap";
import type * as MapMatching from "./map-matching";
import type { MatchedFix } from "./map-matching";
import { createRoadGraph, type RoadEdge } from "./road-graph";
import type { Coordinate } from "./types";

const loads = vi.hoisted(() => ({ count: 0 }));

vi.mock("./map-matching", async (importOriginal) => {
    loads.count += 1;
    return importOriginal<typeof MapMatching>();
});

const LAT0 = -5.09;
const LON0 = -42.8;
const M_LAT = 1 / 111_320;
const M_LON = 1 / (111_320 * Math.cos((LAT0 * Math.PI) / 180));

/** A point `east` / `north` metres from the origin of the test town. */
function at(east: number, north: number): Coordinate {
    return { latitude: LAT0 + north * M_LAT, longitude: LON0 + east * M_LON };
}

interface Street extends RoadEdge {
    name: string;
}

/**
 * Two parallel east–west streets 15 m apart, joined only at both ends: the
 * vehicle drives the southern one, and its noisy fixes sometimes land closer to
 * the northern one.
 */
const GRAPH = createRoadGraph<Street>({
    nodes: [at(0, 0), at(300, 0), at(600, 0), at(0, 15), at(300, 15), at(600, 15)],
    edges: [
        { from: 0, to: 1, name: "Rua Sul" },
        { from: 1, to: 2, name: "Rua Sul" },
        { from: 3, to: 4, name: "Rua Norte" },
        { from: 4, to: 5, name: "Rua Norte" },
        { from: 0, to: 3, name: "Travessa Oeste" },
        { from: 2, to: 5, name: "Travessa Leste" },
    ],
    twoWay: true,
});

const ROUTE: Coordinate[] = [at(0, 0), at(600, 0)];

/** Fixes driving east on Rua Sul, every 20 m, with lateral noise of up to ±10 m. */
const DRIVE: Coordinate[] = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180].map((east, i) =>
    at(east + 10, [3, -4, 8, -2, 10, 9, -6, 10, 4, 9][i]),
);

function vehicle(): HTMLElement {
    return screen.getByTestId("live-route-vehicle");
}

function vehiclePixel(): [number, number] {
    const transform = vehicle().getAttribute("transform") ?? "";
    const [, x, y] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(transform) ?? [];
    return [Number(x), Number(y)];
}

function routeY(container: HTMLElement): number {
    const points =
        container.querySelector("[data-testid='live-route-planned']")?.getAttribute("points") ?? "";
    return Number(points.split(" ")[0].split(",")[1]);
}

describe("LiveRouteMap — without roads", () => {
    it("changes nothing and never loads the matcher", () => {
        const { container } = render(
            <LiveRouteMap
                route={ROUTE}
                trail={DRIVE.slice(0, 3)}
                vehicle={{ position: DRIVE[4] }}
            />,
        );
        expect(screen.queryByTestId("live-route-roads")).toBeNull();
        const trail = screen.getByTestId("live-route-trail");
        expect(trail.tagName.toLowerCase()).toBe("polyline");
        expect(trail.hasAttribute("data-road-match")).toBe(false);
        expect(vehicle().hasAttribute("data-road-match")).toBe(false);
        expect(vehicle().getAttribute("class")).not.toContain("offRoad");
        expect(vehiclePixel()[1]).toBeLessThan(routeY(container) - 5);
        expect(loads.count).toBe(0);
    });
});

describe("LiveRouteMap — roads", () => {
    it("draws every road on screen as a vector layer under the route", () => {
        const { container } = render(<LiveRouteMap route={ROUTE} roads={GRAPH} />);
        const layer = screen.getByTestId("live-route-roads");
        const d = layer.querySelector("path")?.getAttribute("d") ?? "";
        expect(d.match(/M/g)).toHaveLength(GRAPH.edges.length);
        const svg = container.querySelector("svg");
        const children = Array.from(svg?.children ?? []);
        const planned = container.querySelector("[data-testid='live-route-planned']");
        expect(children.indexOf(layer)).toBeLessThan(
            children.indexOf(planned?.parentElement as Element),
        );
    });

    it("keeps the vehicle on the street it drives when the noise lands it nearer the parallel one", async () => {
        const matches: (MatchedFix<Street> | null)[] = [];
        const view = (i: number) => (
            <LiveRouteMap
                route={ROUTE}
                roads={GRAPH}
                vehicle={{ position: DRIVE[i] }}
                onMatch={(match) => matches.push(match)}
            />
        );
        const { container, rerender } = render(view(0));
        await waitFor(() => expect(vehicle().getAttribute("data-road-match")).toBe("snapped"));
        for (let i = 1; i < DRIVE.length; i += 1) rerender(view(i));

        expect(matches).toHaveLength(DRIVE.length);
        expect(matches.every((m) => m?.edge.name === "Rua Sul")).toBe(true);
        expect(vehiclePixel()[1]).toBeCloseTo(routeY(container), 0);
    });

    it("points the vehicle along the matched road when the position has no heading", async () => {
        const { rerender } = render(
            <LiveRouteMap route={ROUTE} roads={GRAPH} vehicle={{ position: DRIVE[0] }} />,
        );
        await waitFor(() => expect(vehicle().getAttribute("data-road-match")).toBe("snapped"));
        rerender(<LiveRouteMap route={ROUTE} roads={GRAPH} vehicle={{ position: DRIVE[1] }} />);
        expect(vehicle().getAttribute("data-heading")).toBe("90");
    });

    it("keeps the heading the app sends", async () => {
        render(
            <LiveRouteMap
                route={ROUTE}
                roads={GRAPH}
                vehicle={{ position: DRIVE[0], heading: 45 }}
            />,
        );
        await waitFor(() => expect(vehicle().getAttribute("data-road-match")).toBe("snapped"));
        expect(vehicle().getAttribute("data-heading")).toBe("45");
    });

    it("shows the raw position with a dashed halo when no road is in reach, never hiding the vehicle", async () => {
        const onMatch = vi.fn();
        const far = at(300, 800);
        const { container } = render(
            <LiveRouteMap
                route={ROUTE}
                roads={GRAPH}
                vehicle={{ position: far }}
                onMatch={onMatch}
            />,
        );
        await waitFor(() => expect(vehicle().getAttribute("data-road-match")).toBe("raw"));
        expect(vehicle().getAttribute("class")).toContain("offRoad");
        expect(vehicle().hasAttribute("data-heading")).toBe(false);
        expect(onMatch).toHaveBeenLastCalledWith(null);
        expect(vehiclePixel()[1]).toBeLessThan(routeY(container) - 100);
    });

    it("draws the trail along the matched road instead of through the noise", async () => {
        const { container } = render(
            <LiveRouteMap
                route={ROUTE}
                roads={GRAPH}
                trail={DRIVE}
                vehicle={{ position: DRIVE[9] }}
            />,
        );
        await waitFor(() =>
            expect(screen.getByTestId("live-route-trail").getAttribute("data-road-match")).toBe(
                "snapped",
            ),
        );
        const d = screen.getByTestId("live-route-trail").getAttribute("d") ?? "";
        const ys = [...d.matchAll(/[ML][-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1]));
        expect(ys.length).toBeGreaterThanOrEqual(2);
        for (const y of ys) expect(y).toBeCloseTo(routeY(container), 0);
    });

    it("hands the app its own edge metadata in onMatch", async () => {
        const onMatch = vi.fn<(match: MatchedFix<Street> | null) => void>();
        render(
            <LiveRouteMap
                route={ROUTE}
                roads={GRAPH}
                vehicle={{ position: DRIVE[1] }}
                onMatch={onMatch}
            />,
        );
        await waitFor(() => expect(onMatch).toHaveBeenCalled());
        const match = onMatch.mock.calls[0][0];
        expect(match?.edge.name).toBe("Rua Sul");
        expect(match?.edgeIndex).toBe(0);
        expect(match?.distanceM).toBeCloseTo(4, 0);
    });

    it("survives StrictMode's double render without moving the vehicle off its road", async () => {
        const view = (i: number) => (
            <StrictMode>
                <LiveRouteMap route={ROUTE} roads={GRAPH} vehicle={{ position: DRIVE[i] }} />
            </StrictMode>
        );
        const { container, rerender } = render(view(0));
        await waitFor(() => expect(vehicle().getAttribute("data-road-match")).toBe("snapped"));
        for (let i = 1; i < DRIVE.length; i += 1) rerender(view(i));
        expect(vehiclePixel()[1]).toBeCloseTo(routeY(container), 0);
    });

    it("loaded the matcher module once for every map that passed roads", () => {
        expect(loads.count).toBe(1);
    });
});
