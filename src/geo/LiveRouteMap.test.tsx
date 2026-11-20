import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveRouteMap, type LiveRouteMarker } from "./LiveRouteMap";
import type { Coordinate } from "./types";

const ROUTE: Coordinate[] = [
    { latitude: -23.55, longitude: -46.64 },
    { latitude: -23.555, longitude: -46.635 },
    { latitude: -23.56, longitude: -46.63 },
    { latitude: -23.565, longitude: -46.625 },
    { latitude: -23.57, longitude: -46.62 },
];
const TRAIL: Coordinate[] = ROUTE.slice(0, 3);

const MARKERS: LiveRouteMarker[] = [
    {
        id: "a",
        label: "Terminal Norte",
        kind: "origin",
        latitude: -23.55,
        longitude: -46.64,
    },
    {
        id: "b",
        label: "Praça Central",
        kind: "stop",
        badge: 3,
        latitude: -23.56,
        longitude: -46.63,
        content: <p>3 passageiros embarcam</p>,
    },
    {
        id: "c",
        label: "Rodoviária",
        kind: "destination",
        badge: 120,
        latitude: -23.57,
        longitude: -46.62,
        content: <p>Fim da linha</p>,
    },
];

function routePoints(container: HTMLElement): string {
    return (
        container.querySelector("[data-testid='live-route-planned']")?.getAttribute("points") ?? ""
    );
}

function firstPixel(container: HTMLElement): [number, number] {
    const [x, y] = routePoints(container).split(" ")[0].split(",").map(Number);
    return [x, y];
}

function segmentLength(container: HTMLElement): number {
    const [a, b] = routePoints(container)
        .split(" ")
        .slice(0, 2)
        .map((pair) => pair.split(",").map(Number));
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("LiveRouteMap — render", () => {
    it("shows an empty state when there is nothing to frame", () => {
        render(<LiveRouteMap />);
        expect(screen.getByText(/sem rota para mostrar/i)).toBeInTheDocument();
    });

    it("draws the planned route and the traveled trail as separate layers", () => {
        const { container } = render(<LiveRouteMap route={ROUTE} trail={TRAIL} />);
        expect(routePoints(container).split(" ")).toHaveLength(5);
        const trail = screen.getByTestId("live-route-trail");
        expect(trail.getAttribute("points")?.split(" ")).toHaveLength(3);
        expect(trail.getAttribute("class")).toContain("trail");
        expect(screen.getByTestId("live-route-planned").getAttribute("class")).toContain("route");
    });

    it("is a labelled region and announces the ETA in a polite status", () => {
        render(<LiveRouteMap route={ROUTE} label="Linha 42" etaLabel="Chegada em 6 minutos" />);
        expect(screen.getByRole("region", { name: "Linha 42" })).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Chegada em 6 minutos");
    });

    it("draws the vehicle as an arrow rotated to its heading", () => {
        render(
            <LiveRouteMap
                route={ROUTE}
                vehicle={{ position: ROUTE[2], heading: 135, label: "Ônibus 42" }}
                animationMs={0}
            />,
        );
        const vehicle = screen.getByRole("img", { name: "Ônibus 42" });
        expect(vehicle.getAttribute("data-heading")).toBe("135");
        expect(vehicle.querySelector("path")?.getAttribute("transform")).toBe("rotate(135.0)");
    });

    it("draws a dot, not an arrow, when the heading is unknown", () => {
        render(<LiveRouteMap route={ROUTE} vehicle={{ position: ROUTE[2] }} animationMs={0} />);
        const vehicle = screen.getByTestId("live-route-vehicle");
        expect(vehicle.querySelector("path")).toBeNull();
        expect(vehicle.hasAttribute("data-heading")).toBe(false);
    });

    it("names each marker with its kind and badge, and caps the badge at 99+", () => {
        render(<LiveRouteMap route={ROUTE} markers={MARKERS} />);
        expect(screen.getByRole("button", { name: "Terminal Norte, origem" })).toHaveAttribute(
            "data-kind",
            "origin",
        );
        expect(
            screen.getByRole("button", { name: "Praça Central, parada, 3" }),
        ).toBeInTheDocument();
        const destination = screen.getByRole("button", { name: "Rodoviária, destino, 99+" });
        expect(destination.querySelector("rect")).not.toBeNull();
        const badge = document.querySelector("[data-marker-badge='c']");
        expect(badge?.textContent).toBe("99+");
        expect(badge?.getAttribute("aria-hidden")).toBe("true");
    });

    it("draws the badge outside the button, so its number never joins the glyph text as the visible label", () => {
        const { container } = render(
            <LiveRouteMap
                markers={[{ ...MARKERS[1], label: "Parada 2 — Praça", glyphText: "2" }]}
            />,
        );
        const button = screen.getByRole("button", { name: "Parada 2 — Praça, parada, 3" });
        expect(button.textContent).toBe("2");
        expect(button.contains(container.querySelector("[data-marker-badge='b']"))).toBe(false);
    });

    it("accepts translated kind names", () => {
        render(
            <LiveRouteMap
                route={ROUTE}
                markers={MARKERS}
                kindLabels={{ origin: "origin", stop: "stop", destination: "destination" }}
            />,
        );
        expect(screen.getByRole("button", { name: "Terminal Norte, origin" })).toBeInTheDocument();
    });

    it("draws self-hosted tiles under the lines only when tileUrl is set", () => {
        const { container, unmount } = render(<LiveRouteMap route={ROUTE} />);
        expect(container.querySelector("image")).toBeNull();
        unmount();

        const { container: tiled } = render(
            <LiveRouteMap
                route={ROUTE}
                tileUrl="https://tiles.example/{z}/{x}/{y}.png"
                tileAttribution="© Dados do mapa"
            />,
        );
        const image = tiled.querySelector("image");
        expect(image?.getAttribute("href")).toMatch(
            /^https:\/\/tiles\.example\/\d+\/\d+\/\d+\.png$/,
        );
        expect(screen.getByText("© Dados do mapa")).toBeInTheDocument();
    });

    it("renders a metric scale bar, and none when showScale is off", () => {
        const { container, unmount } = render(<LiveRouteMap route={ROUTE} />);
        expect(container.querySelector("g[class*='scale'] text")?.textContent).toMatch(
            /\d+\s(m|km)$/,
        );
        unmount();
        const { container: bare } = render(<LiveRouteMap route={ROUTE} showScale={false} />);
        expect(bare.querySelector("g[class*='scale']")).toBeNull();
    });
});

describe("LiveRouteMap — marker content", () => {
    it("opens the content on click and closes it on a second click", () => {
        const onMarkerOpenChange = vi.fn();
        render(
            <LiveRouteMap
                route={ROUTE}
                markers={MARKERS}
                onMarkerOpenChange={onMarkerOpenChange}
            />,
        );
        const marker = screen.getByRole("button", { name: /praça central/i });
        expect(marker).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(marker);
        expect(screen.getByRole("dialog", { name: "Praça Central" })).toHaveTextContent(
            "3 passageiros embarcam",
        );
        expect(marker).toHaveAttribute("aria-expanded", "true");
        expect(onMarkerOpenChange).toHaveBeenLastCalledWith("b");

        fireEvent.click(marker);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(onMarkerOpenChange).toHaveBeenLastCalledWith(null);
    });

    it("opens by Enter and by Space, moves focus into the panel, and Escape returns it", () => {
        render(<LiveRouteMap route={ROUTE} markers={MARKERS} />);
        const marker = screen.getByRole("button", { name: /praça central/i });
        marker.focus();

        fireEvent.keyDown(marker, { key: "Enter" });
        const panel = screen.getByRole("dialog");
        expect(panel).toHaveFocus();

        fireEvent.keyDown(panel, { key: "Escape" });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(marker).toHaveFocus();

        fireEvent.keyDown(marker, { key: " " });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("closes from the close button and from a click on the map", () => {
        const { container } = render(
            <LiveRouteMap route={ROUTE} markers={MARKERS} closeLabel="Fechar painel" />,
        );
        fireEvent.click(screen.getByRole("button", { name: /rodoviária/i }));
        fireEvent.click(screen.getByRole("button", { name: "Fechar painel" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /rodoviária/i }));
        fireEvent.click(container.querySelector("svg") as SVGSVGElement);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("does not expand a marker that has no content", () => {
        render(<LiveRouteMap route={ROUTE} markers={MARKERS} />);
        const origin = screen.getByRole("button", { name: /terminal norte/i });
        expect(origin).not.toHaveAttribute("aria-expanded");
        fireEvent.click(origin);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});

describe("LiveRouteMap — follow", () => {
    it("does not reframe the map when the vehicle moves inside the screen", () => {
        const { container, rerender } = render(
            <LiveRouteMap route={ROUTE} vehicle={{ position: ROUTE[2] }} follow animationMs={0} />,
        );
        const before = routePoints(container);
        rerender(
            <LiveRouteMap route={ROUTE} vehicle={{ position: ROUTE[3] }} follow animationMs={0} />,
        );
        expect(routePoints(container)).toBe(before);
    });

    it("pans at the same zoom when the vehicle leaves the screen", () => {
        const { container, rerender } = render(
            <LiveRouteMap route={ROUTE} vehicle={{ position: ROUTE[2] }} follow animationMs={0} />,
        );
        const zoom = segmentLength(container);
        const [x0] = firstPixel(container);
        rerender(
            <LiveRouteMap
                route={ROUTE}
                vehicle={{ position: { latitude: -23.62, longitude: -46.57 } }}
                follow
                animationMs={0}
            />,
        );
        expect(Math.abs(segmentLength(container) - zoom)).toBeLessThan(0.5);
        expect(firstPixel(container)[0]).not.toBeCloseTo(x0, 1);
    });

    it("leaves the map where the user dragged it and offers to recenter", () => {
        const far = { latitude: -23.62, longitude: -46.57 };
        const { container, rerender } = render(
            <LiveRouteMap route={ROUTE} vehicle={{ position: ROUTE[2] }} follow animationMs={0} />,
        );
        const svg = container.querySelector("svg") as SVGSVGElement;
        expect(screen.queryByRole("button", { name: "Recentralizar" })).not.toBeInTheDocument();
        const [x0, y0] = firstPixel(container);

        fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
        fireEvent.pointerMove(svg, { clientX: 160, clientY: 130, pointerId: 1 });
        fireEvent.pointerUp(svg, { pointerId: 1 });
        const [x1, y1] = firstPixel(container);
        expect(x1 - x0).toBeCloseTo(60, 0);
        expect(y1 - y0).toBeCloseTo(30, 0);

        rerender(<LiveRouteMap route={ROUTE} vehicle={{ position: far }} follow animationMs={0} />);
        expect(firstPixel(container)).toEqual([x1, y1]);

        fireEvent.click(screen.getByRole("button", { name: "Recentralizar" }));
        expect(screen.queryByRole("button", { name: "Recentralizar" })).not.toBeInTheDocument();
        expect(firstPixel(container)).not.toEqual([x1, y1]);
    });

    it("treats a press without movement as a click, not a drag", () => {
        const { container } = render(<LiveRouteMap route={ROUTE} markers={MARKERS} />);
        const svg = container.querySelector("svg") as SVGSVGElement;
        fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
        fireEvent.pointerMove(svg, { clientX: 102, clientY: 101, pointerId: 1 });
        fireEvent.pointerUp(svg, { pointerId: 1 });
        expect(screen.queryByRole("button", { name: "Recentralizar" })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /praça central/i }));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("swallows the click that ends a drag, so a drag over a marker does not open it", () => {
        const { container } = render(<LiveRouteMap route={ROUTE} markers={MARKERS} />);
        const svg = container.querySelector("svg") as SVGSVGElement;
        fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
        fireEvent.pointerMove(svg, { clientX: 140, clientY: 100, pointerId: 1 });
        fireEvent.pointerUp(svg, { pointerId: 1 });
        fireEvent.click(screen.getByRole("button", { name: /praça central/i }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("without follow, recenter returns to the route fit", () => {
        const { container } = render(
            <LiveRouteMap route={ROUTE} vehicle={{ position: ROUTE[2] }} animationMs={0} />,
        );
        const svg = container.querySelector("svg") as SVGSVGElement;
        const fit = firstPixel(container);
        fireEvent.pointerDown(svg, { clientX: 0, clientY: 0, pointerId: 1, button: 0 });
        fireEvent.pointerMove(svg, { clientX: 80, clientY: 0, pointerId: 1 });
        fireEvent.pointerUp(svg, { pointerId: 1 });
        fireEvent.click(screen.getByRole("button", { name: "Recentralizar" }));
        expect(firstPixel(container)[0]).toBeCloseTo(fit[0], 6);
    });
});

describe("LiveRouteMap — vehicle glide", () => {
    function stubFrames(): (time: number) => void {
        let pending: FrameRequestCallback | null = null;
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            pending = cb;
            return 1;
        });
        vi.stubGlobal("cancelAnimationFrame", () => {
            pending = null;
        });
        return (time: number) => {
            const cb = pending;
            pending = null;
            act(() => cb?.(time));
        };
    }

    function stubMotion(reduce: boolean): void {
        vi.stubGlobal(
            "matchMedia",
            (query: string) =>
                ({
                    matches: reduce && query.includes("reduce"),
                    media: query,
                    addEventListener: () => undefined,
                    removeEventListener: () => undefined,
                }) as unknown as MediaQueryList,
        );
    }

    function vehicleX(): number {
        const transform = screen.getByTestId("live-route-vehicle").getAttribute("transform") ?? "";
        return Number(/translate\(([-\d.]+)/.exec(transform)?.[1]);
    }

    it("glides between two positions instead of jumping", () => {
        const frame = stubFrames();
        stubMotion(false);
        const { rerender } = render(
            <LiveRouteMap route={ROUTE} vehicle={{ position: ROUTE[1] }} animationMs={600} />,
        );
        const start = vehicleX();
        rerender(<LiveRouteMap route={ROUTE} vehicle={{ position: ROUTE[3] }} animationMs={600} />);
        expect(vehicleX()).toBe(start);

        frame(1000);
        frame(1300);
        const middle = vehicleX();
        frame(1600);
        const end = vehicleX();
        expect(middle).toBeGreaterThan(start);
        expect(middle).toBeLessThan(end);
    });

    it("jumps straight to the new position under prefers-reduced-motion", () => {
        const frame = stubFrames();
        stubMotion(true);
        const { rerender } = render(
            <LiveRouteMap route={ROUTE} vehicle={{ position: ROUTE[1] }} animationMs={600} />,
        );
        const start = vehicleX();
        rerender(<LiveRouteMap route={ROUTE} vehicle={{ position: ROUTE[3] }} animationMs={600} />);
        frame(0);
        expect(vehicleX()).toBeGreaterThan(start);
        const settled = vehicleX();
        frame(16);
        expect(vehicleX()).toBe(settled);
    });
});
