import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BrazilStateMap } from "./BrazilStateMap";
import { loadStateMunicipalities } from "./state-geo";

describe("loadStateMunicipalities", () => {
    it("loads a state's municipalities lazily", async () => {
        const ac = await loadStateMunicipalities("AC");
        expect(ac?.uf).toBe("AC");
        expect(ac?.features.length).toBeGreaterThan(0);
        expect(ac?.features[0].properties).toHaveProperty("name");
        expect(ac?.features[0].properties).toHaveProperty("id");
    });
});

describe("BrazilStateMap", () => {
    it("renders one path per municipality after loading", async () => {
        const { container } = render(<BrazilStateMap uf="AC" />);
        await waitFor(() =>
            expect(container.querySelectorAll("path[data-city-id]").length).toBeGreaterThan(0),
        );
        const ac = await loadStateMunicipalities("AC");
        expect(container.querySelectorAll("path[data-city-id]").length).toBe(ac!.features.length);
    });

    it("fires onSelect with the clicked municipality", async () => {
        const onSelect = vi.fn();
        const { container } = render(<BrazilStateMap uf="AC" onSelect={onSelect} />);
        await waitFor(() => expect(container.querySelector("path[data-city-id]")).toBeTruthy());

        const first = container.querySelector("path[data-city-id]")!;
        const name = first.getAttribute("data-city");
        const id = first.getAttribute("data-city-id");
        await userEvent.click(first);
        expect(onSelect).toHaveBeenCalledWith({ id, name });
    });

    it("marks a municipality selected by name", async () => {
        const ac = await loadStateMunicipalities("AC");
        const target = ac!.features[0].properties.name;
        const { container } = render(
            <BrazilStateMap uf="AC" selected={target} onSelect={() => {}} />,
        );
        await waitFor(() => expect(container.querySelector("path[data-city-id]")).toBeTruthy());
        const el = container.querySelector(`path[data-city="${CSS.escape(target)}"]`)!;
        expect(el.getAttribute("aria-pressed")).toBe("true");
    });

    it("shows a hover tooltip with municipality name + IBGE code", async () => {
        const { container } = render(<BrazilStateMap uf="AC" />);
        await waitFor(() => expect(container.querySelector("path[data-city-id]")).toBeTruthy());

        const path = container.querySelector("path[data-city-id]")!;
        const name = path.getAttribute("data-city")!;
        const id = path.getAttribute("data-city-id")!;
        fireEvent.mouseMove(path);

        const tip = await screen.findByTestId("map-tooltip");
        expect(tip).toHaveTextContent(name);
        expect(tip).toHaveTextContent(`IBGE ${id}`);
    });
});

describe("BrazilStateMap — choropleth and labels", () => {
    async function renderLoaded(ui: Parameters<typeof render>[0]) {
        const view = render(ui);
        await waitFor(() =>
            expect(view.container.querySelector("path[data-city-id]")).toBeTruthy(),
        );
        return view;
    }

    it("tints municipalities from a min/max ramp keyed by name", async () => {
        const ac = await loadStateMunicipalities("AC");
        const [low, high] = [ac!.features[0], ac!.features[1]];
        const { container } = await renderLoaded(
            <BrazilStateMap
                uf="AC"
                values={{ [low.properties.name]: 0, [high.properties.name]: 100 }}
            />,
        );
        const lowEl = container.querySelector(
            `path[data-city="${CSS.escape(low.properties.name)}"]`,
        ) as SVGPathElement;
        const highEl = container.querySelector(
            `path[data-city="${CSS.escape(high.properties.name)}"]`,
        ) as SVGPathElement;
        expect(lowEl.style.fill).toBeTruthy();
        expect(highEl.style.fill).toBeTruthy();
        expect(lowEl.style.fill).not.toBe(highEl.style.fill);
    });

    it("keys choropleth values by IBGE id as well", async () => {
        const ac = await loadStateMunicipalities("AC");
        const target = ac!.features[0];
        const { container } = await renderLoaded(
            <BrazilStateMap uf="AC" values={{ [target.properties.id]: 10 }} />,
        );
        const el = container.querySelector(
            `path[data-city-id="${target.properties.id}"]`,
        ) as SVGPathElement;
        expect(el.style.fill).toBeTruthy();
    });

    it("prefers an explicit colorScale over the ramp", async () => {
        const ac = await loadStateMunicipalities("AC");
        const target = ac!.features[0].properties.name;
        const colorScale = vi.fn(() => "rgb(1, 2, 3)");
        const { container } = await renderLoaded(
            <BrazilStateMap uf="AC" values={{ [target]: 5 }} colorScale={colorScale} />,
        );
        const el = container.querySelector(
            `path[data-city="${CSS.escape(target)}"]`,
        ) as SVGPathElement;
        expect(el.style.fill).toBe("rgb(1, 2, 3)");
        expect(colorScale).toHaveBeenCalledWith(5);
    });

    it("handles a single-value range without dividing by zero", async () => {
        const ac = await loadStateMunicipalities("AC");
        const [a, b] = [ac!.features[0].properties.name, ac!.features[1].properties.name];
        const { container } = await renderLoaded(
            <BrazilStateMap uf="AC" values={{ [a]: 7, [b]: 7 }} />,
        );
        const el = container.querySelector(`path[data-city="${CSS.escape(a)}"]`) as SVGPathElement;
        expect(el.style.fill).toBeTruthy();
    });

    it("ignores an empty values map", async () => {
        const { container } = await renderLoaded(<BrazilStateMap uf="AC" values={{}} />);
        const el = container.querySelector("path[data-city-id]") as SVGPathElement;
        expect(el.style.fill).toBe("");
    });

    it("leaves a selected municipality untinted", async () => {
        const ac = await loadStateMunicipalities("AC");
        const target = ac!.features[0].properties.name;
        const { container } = await renderLoaded(
            <BrazilStateMap uf="AC" values={{ [target]: 100 }} selected={[target]} />,
        );
        const el = container.querySelector(
            `path[data-city="${CSS.escape(target)}"]`,
        ) as SVGPathElement;
        expect(el.style.fill).toBe("");
        expect(el.className.baseVal).toContain("selected");
    });

    it("renders centroid labels only when showLabels is on", async () => {
        const { container, unmount } = await renderLoaded(<BrazilStateMap uf="AC" />);
        expect(container.querySelectorAll("text").length).toBe(0);
        unmount();

        const { container: labelled } = await renderLoaded(<BrazilStateMap uf="AC" showLabels />);
        expect(labelled.querySelectorAll("text").length).toBeGreaterThan(0);
    });

    it("stays non-interactive without onSelect", async () => {
        const { container } = await renderLoaded(<BrazilStateMap uf="AC" />);
        const el = container.querySelector("path[data-city-id]") as SVGPathElement;
        expect(el.getAttribute("role")).toBeNull();
        expect(el.getAttribute("aria-pressed")).toBeNull();
    });

    it("selects a municipality with Enter and Space", async () => {
        const onSelect = vi.fn();
        const { container } = await renderLoaded(<BrazilStateMap uf="AC" onSelect={onSelect} />);
        const el = container.querySelector("path[data-city-id]") as SVGPathElement;

        fireEvent.keyDown(el, { key: "Enter" });
        fireEvent.keyDown(el, { key: " " });
        expect(onSelect).toHaveBeenCalledTimes(2);

        fireEvent.keyDown(el, { key: "Escape" });
        expect(onSelect).toHaveBeenCalledTimes(2);
    });

    it("shows a loading placeholder, custom when provided", async () => {
        const { unmount } = render(<BrazilStateMap uf="AC" />);
        expect(screen.getByText("Carregando municípios…")).toBeInTheDocument();
        unmount();

        render(<BrazilStateMap uf="AC" loadingContent="Aguarde" />);
        expect(screen.getByText("Aguarde")).toBeInTheDocument();
    });

    it("derives the accessible label from the state, and honours an override", async () => {
        const { unmount } = await renderLoaded(<BrazilStateMap uf="AC" />);
        expect(screen.getByRole("group", { name: /Municípios de Acre/ })).toBeInTheDocument();
        unmount();

        await renderLoaded(<BrazilStateMap uf="AC" label="Mapa do AC" />);
        expect(screen.getByRole("group", { name: "Mapa do AC" })).toBeInTheDocument();
    });
});

describe("BrazilStateMap — tooltip, markers and zoom", () => {
    async function renderLoaded(ui: Parameters<typeof render>[0]) {
        const view = render(ui);
        await waitFor(() =>
            expect(view.container.querySelector("path[data-city-id]")).toBeTruthy(),
        );
        return view;
    }

    it("appends the choropleth value to the default tooltip", async () => {
        const ac = await loadStateMunicipalities("AC");
        const target = ac!.features[0].properties.name;
        const { container } = await renderLoaded(
            <BrazilStateMap uf="AC" values={{ [target]: 42 }} />,
        );
        fireEvent.mouseMove(
            container.querySelector(`path[data-city="${CSS.escape(target)}"]`) as SVGPathElement,
        );
        expect(await screen.findByTestId("map-tooltip")).toHaveTextContent("· 42");
    });

    it("uses a custom renderTooltip and passes the value through", async () => {
        const ac = await loadStateMunicipalities("AC");
        const target = ac!.features[0].properties.name;
        const renderTooltip = vi.fn((data: { name: string; value?: number }) => (
            <span>{`${data.name}=${data.value ?? "-"}`}</span>
        ));
        const { container } = await renderLoaded(
            <BrazilStateMap uf="AC" values={{ [target]: 9 }} renderTooltip={renderTooltip} />,
        );
        fireEvent.mouseMove(
            container.querySelector(`path[data-city="${CSS.escape(target)}"]`) as SVGPathElement,
        );
        expect(await screen.findByText(`${target}=9`)).toBeInTheDocument();
    });

    it("clears the tooltip on mouse leave and skips it when showTooltip is off", async () => {
        const { container, unmount } = await renderLoaded(<BrazilStateMap uf="AC" />);
        const path = container.querySelector("path[data-city-id]") as SVGPathElement;
        fireEvent.mouseMove(path);
        expect(await screen.findByTestId("map-tooltip")).toBeInTheDocument();
        fireEvent.mouseLeave(path);
        expect(screen.queryByTestId("map-tooltip")).not.toBeInTheDocument();
        unmount();

        const { container: quiet } = await renderLoaded(
            <BrazilStateMap uf="AC" showTooltip={false} />,
        );
        fireEvent.mouseMove(quiet.querySelector("path[data-city-id]") as SVGPathElement);
        expect(screen.queryByTestId("map-tooltip")).not.toBeInTheDocument();
    });

    it("overlays markers and reports clicks", async () => {
        const onMarkerClick = vi.fn();
        const markers = [{ latitude: -9.97, longitude: -67.8, id: "rb", label: "Rio Branco" }];
        const { container } = await renderLoaded(
            <BrazilStateMap uf="AC" markers={markers} onMarkerClick={onMarkerClick} />,
        );
        const marker = container.querySelector("circle[data-marker-id='rb']") as SVGCircleElement;
        expect(marker).toBeTruthy();

        fireEvent.click(marker);
        expect(onMarkerClick).toHaveBeenCalledWith(markers[0], 0);

        fireEvent.keyDown(marker, { key: "Enter" });
        fireEvent.keyDown(marker, { key: " " });
        fireEvent.keyDown(marker, { key: "x" });
        expect(onMarkerClick).toHaveBeenCalledTimes(3);
    });

    it("skips the marker overlay for an empty array", async () => {
        const { container } = await renderLoaded(<BrazilStateMap uf="AC" markers={[]} />);
        expect(container.querySelector("circle[data-marker-id]")).toBeNull();
    });

    it("renders non-interactive markers with a default radius and no title", async () => {
        const { container } = await renderLoaded(
            <BrazilStateMap uf="AC" markers={[{ latitude: -9.97, longitude: -67.8 }]} />,
        );
        const marker = container.querySelector("circle[data-marker-id]") as SVGCircleElement;
        expect(marker.getAttribute("data-marker-id")).toBe("0");
        expect(marker.getAttribute("r")).toBe("6");
        expect(marker.getAttribute("role")).toBeNull();
        expect(container.querySelector("title")).toBeNull();
    });

    it("ignores pan/zoom gestures when zoomable is off", async () => {
        const { container } = await renderLoaded(<BrazilStateMap uf="AC" />);
        const svg = container.querySelector("svg") as SVGSVGElement;
        fireEvent.wheel(svg, { deltaY: -100 });
        expect(container.querySelector("g")?.getAttribute("transform")).toBeNull();
        expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    });

    it("zooms on wheel, pans on drag and resets", async () => {
        const { container } = await renderLoaded(<BrazilStateMap uf="AC" zoomable />);
        const svg = container.querySelector("svg") as SVGSVGElement;
        const group = container.querySelector("svg > g") as SVGGElement;

        fireEvent.wheel(svg, { deltaY: -100, clientX: 100, clientY: 100 });
        expect(group.getAttribute("transform")).toMatch(/scale\(1\.15/);

        fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
        fireEvent.pointerMove(svg, { clientX: 40, clientY: 30, pointerId: 1 });
        fireEvent.pointerUp(svg, { pointerId: 1 });
        expect(group.getAttribute("transform")).not.toMatch(/^translate\(0 0\)/);

        fireEvent.pointerMove(svg, { clientX: 90, clientY: 90, pointerId: 1 });

        const reset = screen.getByRole("button", { name: "Reset" });
        fireEvent.click(reset);
        expect(group.getAttribute("transform")).toBe("translate(0 0) scale(1)");
    });

    it("clamps zoom-out at the initial fit and resets on double click", async () => {
        const { container } = await renderLoaded(<BrazilStateMap uf="AC" zoomable />);
        const svg = container.querySelector("svg") as SVGSVGElement;
        const group = container.querySelector("svg > g") as SVGGElement;

        fireEvent.wheel(svg, { deltaY: 100, clientX: 0, clientY: 0 });
        expect(group.getAttribute("transform")).toBe("translate(0 0) scale(1)");

        fireEvent.wheel(svg, { deltaY: -100, clientX: 0, clientY: 0 });
        fireEvent.doubleClick(svg);
        expect(group.getAttribute("transform")).toBe("translate(0 0) scale(1)");
    });

    it("ends a drag when the pointer leaves the map", async () => {
        const { container } = await renderLoaded(<BrazilStateMap uf="AC" zoomable />);
        const svg = container.querySelector("svg") as SVGSVGElement;
        const group = container.querySelector("svg > g") as SVGGElement;

        fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 2 });
        fireEvent.pointerLeave(svg, { pointerId: 2 });
        fireEvent.pointerMove(svg, { clientX: 200, clientY: 200, pointerId: 2 });
        expect(group.getAttribute("transform")).toBe("translate(0 0) scale(1)");
    });
});
