import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrajectoryMap } from "./TrajectoryMap";
import type { Coordinate } from "./types";

const PATH: Coordinate[] = [
    { latitude: -23.55, longitude: -46.63 },
    { latitude: -23.56, longitude: -46.64 },
    { latitude: -23.57, longitude: -46.65 },
];

describe("TrajectoryMap", () => {
    it("renders an empty state with no points", () => {
        render(<TrajectoryMap points={[]} />);
        expect(screen.getByText(/sem pontos de trajetória/i)).toBeInTheDocument();
    });

    it("renders a polyline path for the SVG mode", () => {
        render(<TrajectoryMap points={PATH} label="Rota" />);
        const path = screen.getByTestId("trajectory-path");
        expect(path).toBeInTheDocument();
        // Three coordinates → three "x,y" pairs in the points attribute.
        expect(path.getAttribute("points")?.trim().split(" ")).toHaveLength(3);
    });

    it("exposes an accessible label", () => {
        render(<TrajectoryMap points={PATH} label="Minha rota" />);
        expect(screen.getByRole("img", { name: "Minha rota" })).toBeInTheDocument();
    });

    it("applies a custom stroke color to the path", () => {
        render(<TrajectoryMap points={PATH} strokeColor="#ff0000" />);
        expect(screen.getByTestId("trajectory-path").getAttribute("stroke")).toBe("#ff0000");
    });
});

describe("TrajectoryMap — SVG chrome", () => {
    function svgRoot(container: HTMLElement): SVGSVGElement {
        return container.querySelector("svg") as SVGSVGElement;
    }

    it("draws the grid by default and drops it when showGrid is off", () => {
        const { container, unmount } = render(<TrajectoryMap points={PATH} />);
        expect(svgRoot(container).querySelectorAll("line").length).toBeGreaterThanOrEqual(6);
        unmount();

        const { container: bare } = render(<TrajectoryMap points={PATH} showGrid={false} />);
        expect(bare.querySelectorAll("g[class*='grid']").length).toBe(0);
    });

    it("renders a scale bar with a metric label, and hides it when showScale is off", () => {
        const { container, unmount } = render(<TrajectoryMap points={PATH} />);
        const scaleText = container.querySelector("g[class*='scale'] text");
        expect(scaleText?.textContent).toMatch(/\d+\s(m|km)$/);
        unmount();

        const { container: bare } = render(<TrajectoryMap points={PATH} showScale={false} />);
        expect(bare.querySelector("g[class*='scale']")).toBeNull();
    });

    it("switches the scale label to km over a long trajectory", () => {
        const long: Coordinate[] = [
            { latitude: -23.5, longitude: -46.6 },
            { latitude: -22.9, longitude: -43.2 },
        ];
        const { container } = render(<TrajectoryMap points={long} />);
        expect(container.querySelector("g[class*='scale'] text")?.textContent).toMatch(/km$/);
    });

    it("marks the end point only when there is no `current`", () => {
        const { container, unmount } = render(<TrajectoryMap points={PATH} />);
        expect(container.querySelector("circle[class*='end']")).not.toBeNull();
        expect(container.querySelector("circle[class*='current']")).toBeNull();
        unmount();

        const { container: live } = render(<TrajectoryMap points={PATH} current={PATH[2]} />);
        expect(live.querySelector("circle[class*='end']")).toBeNull();
        expect(live.querySelector("circle[class*='current']")).not.toBeNull();
        expect(live.querySelector("circle[class*='pulse']")).not.toBeNull();
    });

    it("plots a single point without a polyline segment", () => {
        const { container } = render(<TrajectoryMap points={[PATH[0]]} />);
        expect(container.querySelector("circle[class*='start']")).not.toBeNull();
    });

    it("renders from `current` alone with no path points", () => {
        const { container } = render(<TrajectoryMap points={[]} current={PATH[0]} />);
        expect(screen.queryByText("Sem pontos de trajetória ainda.")).not.toBeInTheDocument();
        expect(container.querySelector("circle[class*='current']")).not.toBeNull();
    });

    it("honours a custom height and merges an inline style", () => {
        const { container } = render(
            <TrajectoryMap points={PATH} height={500} style={{ opacity: 0.5 }} />,
        );
        const root = container.firstChild as HTMLElement;
        expect(root.style.height).toBe("500px");
        expect(root.style.opacity).toBe("0.5");
        expect(svgRoot(container).getAttribute("viewBox")).toContain("500");
    });
});

describe("TrajectoryMap — markers", () => {
    const markers = [
        { latitude: -23.55, longitude: -46.63, id: "start", label: "Saída" },
        {
            latitude: -23.57,
            longitude: -46.65,
            id: "end",
            label: "Chegada",
            color: "#f00",
            radius: 9,
        },
    ];

    it("draws each marker with its id, colour, radius and title", () => {
        const { container } = render(<TrajectoryMap points={PATH} markers={markers} />);
        const drawn = container.querySelectorAll("circle[data-marker-id]");
        expect(drawn).toHaveLength(2);
        expect(drawn[1].getAttribute("r")).toBe("9");
        expect((drawn[1] as SVGCircleElement).style.fill).toBe("rgb(255, 0, 0)");
        expect(container.querySelectorAll("title")).toHaveLength(2);
    });

    it("stays non-interactive without onMarkerClick", () => {
        const { container } = render(<TrajectoryMap points={PATH} markers={markers} />);
        const first = container.querySelector("circle[data-marker-id]") as SVGCircleElement;
        expect(first.getAttribute("role")).toBeNull();
        expect(first.getAttribute("tabindex")).toBeNull();
    });

    it("reports clicks and Enter/Space activations when interactive", async () => {
        const onMarkerClick = vi.fn();
        render(<TrajectoryMap points={PATH} markers={markers} onMarkerClick={onMarkerClick} />);

        const buttons = screen.getAllByRole("button");
        expect(buttons).toHaveLength(2);

        fireEvent.click(buttons[0]);
        expect(onMarkerClick).toHaveBeenLastCalledWith(markers[0], 0);

        fireEvent.keyDown(buttons[1], { key: "Enter" });
        expect(onMarkerClick).toHaveBeenLastCalledWith(markers[1], 1);

        fireEvent.keyDown(buttons[1], { key: " " });
        expect(onMarkerClick).toHaveBeenCalledTimes(3);

        fireEvent.keyDown(buttons[1], { key: "Tab" });
        expect(onMarkerClick).toHaveBeenCalledTimes(3);
    });

    it("falls back to the index when a marker has no id or label", () => {
        const { container } = render(
            <TrajectoryMap points={PATH} markers={[{ latitude: -23.55, longitude: -46.63 }]} />,
        );
        const drawn = container.querySelector("circle[data-marker-id]") as SVGCircleElement;
        expect(drawn.getAttribute("data-marker-id")).toBe("0");
        expect(drawn.getAttribute("r")).toBe("6");
        expect(container.querySelector("title")).toBeNull();
    });

    it("includes markers in the auto-fit even with no path", () => {
        const { container } = render(<TrajectoryMap points={[]} markers={markers} />);
        expect(container.querySelectorAll("circle[data-marker-id]")).toHaveLength(2);
    });
});

describe("TrajectoryMap — tile mode", () => {
    it("renders the lazy Leaflet layer behind a loading fallback", async () => {
        render(<TrajectoryMap points={PATH} tileUrl="https://t/{z}/{x}/{y}.png" label="Rota" />);
        expect(screen.getByText("Carregando mapa…")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Rota" })).toBeInTheDocument();
        expect(await screen.findByText(/Leaflet não encontrado/)).toBeInTheDocument();
    });
});

describe("TrajectoryMap — resize observation", () => {
    it("re-projects when the container reports a new width", () => {
        const observers: ((entries: { contentRect: { width: number } }[]) => void)[] = [];
        const original = globalThis.ResizeObserver;
        class FakeResizeObserver {
            constructor(callback: (entries: { contentRect: { width: number } }[]) => void) {
                observers.push(callback);
            }
            observe(): void {}
            disconnect(): void {}
            unobserve(): void {}
        }
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);

        const { container } = render(<TrajectoryMap points={PATH} />);
        expect(container.querySelector("svg")?.getAttribute("viewBox")).toContain("600");

        act(() => observers[0]?.([{ contentRect: { width: 900 } }]));
        expect(container.querySelector("svg")?.getAttribute("viewBox")).toContain("900");

        act(() => observers[0]?.([{ contentRect: { width: 0 } }]));
        expect(container.querySelector("svg")?.getAttribute("viewBox")).toContain("900");

        vi.stubGlobal("ResizeObserver", original);
    });

    it("renders without a ResizeObserver at all", () => {
        const original = globalThis.ResizeObserver;
        vi.stubGlobal("ResizeObserver", undefined);
        const { container } = render(<TrajectoryMap points={PATH} />);
        expect(container.querySelector("svg")).not.toBeNull();
        vi.stubGlobal("ResizeObserver", original);
    });
});
