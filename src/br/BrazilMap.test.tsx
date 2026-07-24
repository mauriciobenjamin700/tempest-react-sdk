import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BrazilMap } from "./BrazilMap";

describe("BrazilMap", () => {
    it("renders all 27 UF paths after the geometry loads", async () => {
        const { container } = render(<BrazilMap showLabels={false} />);
        await waitFor(() => expect(container.querySelectorAll("path[data-uf]").length).toBe(27));
    });

    it("fires onSelect with the clicked UF", async () => {
        const onSelect = vi.fn();
        const { container } = render(<BrazilMap onSelect={onSelect} />);
        await waitFor(() => expect(container.querySelector('path[data-uf="SP"]')).toBeTruthy());

        const sp = container.querySelector('path[data-uf="SP"]')!;
        await userEvent.click(sp);
        expect(onSelect).toHaveBeenCalledWith("SP");
    });

    it("marks the selected UF as pressed", async () => {
        const { container } = render(<BrazilMap selected="RJ" onSelect={() => {}} />);
        await waitFor(() => expect(container.querySelector('path[data-uf="RJ"]')).toBeTruthy());
        const rj = container.querySelector('path[data-uf="RJ"]')!;
        expect(rj.getAttribute("aria-pressed")).toBe("true");
    });

    it("renders UF labels by default", async () => {
        render(<BrazilMap />);
        await waitFor(() => expect(screen.getByText("SP")).toBeInTheDocument());
    });

    it("shows a hover tooltip with name + region + city count", async () => {
        const { container } = render(<BrazilMap />);
        await waitFor(() => expect(container.querySelector('path[data-uf="SP"]')).toBeTruthy());

        fireEvent.mouseMove(container.querySelector('path[data-uf="SP"]')!);
        const tip = await screen.findByTestId("map-tooltip");
        expect(tip).toHaveTextContent("São Paulo (SP)");
        expect(tip).toHaveTextContent("Sudeste");
        expect(tip).toHaveTextContent(/\d+ cidades/);

        fireEvent.mouseLeave(container.querySelector('path[data-uf="SP"]')!);
        expect(screen.queryByTestId("map-tooltip")).toBeNull();
    });

    it("appends the choropleth value to the tooltip when values are set", async () => {
        const { container } = render(<BrazilMap values={{ SP: 42 }} />);
        await waitFor(() => expect(container.querySelector('path[data-uf="SP"]')).toBeTruthy());
        fireEvent.mouseMove(container.querySelector('path[data-uf="SP"]')!);
        expect(await screen.findByTestId("map-tooltip")).toHaveTextContent("42");
    });

    it("suppresses the tooltip when showTooltip is false", async () => {
        const { container } = render(<BrazilMap showTooltip={false} />);
        await waitFor(() => expect(container.querySelector('path[data-uf="SP"]')).toBeTruthy());
        fireEvent.mouseMove(container.querySelector('path[data-uf="SP"]')!);
        expect(screen.queryByTestId("map-tooltip")).toBeNull();
    });

    it("tints states by region when colorByRegion is set", async () => {
        const { container } = render(<BrazilMap colorByRegion />);
        await waitFor(() => expect(container.querySelector('path[data-uf="SP"]')).toBeTruthy());
        // SP is Sudeste (#e15759).
        const sp = container.querySelector('path[data-uf="SP"]') as SVGPathElement;
        expect(sp.style.fill).toBe("rgb(225, 87, 89)");
    });

    it("zooms on wheel and shows a reset control when zoomable", async () => {
        const { container } = render(<BrazilMap zoomable />);
        await waitFor(() => expect(container.querySelector("svg g")).toBeTruthy());

        expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
        fireEvent.wheel(container.querySelector("svg")!, { deltaY: -100 });

        // Zoomed in → transform is no longer the identity, reset control appears.
        expect(container.querySelector("svg g")?.getAttribute("transform")).not.toBe(
            "translate(0 0) scale(1)",
        );
        fireEvent.click(screen.getByRole("button", { name: "Reset" }));
        expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
    });

    it("plots markers and fires onMarkerClick", async () => {
        const onMarkerClick = vi.fn();
        const markers = [{ latitude: -23.55, longitude: -46.63, label: "SP capital", id: "sp" }];
        const { container } = render(<BrazilMap markers={markers} onMarkerClick={onMarkerClick} />);
        await waitFor(() =>
            expect(container.querySelector("circle[data-marker-id='sp']")).toBeTruthy(),
        );
        await userEvent.click(container.querySelector("circle[data-marker-id='sp']")!);
        expect(onMarkerClick).toHaveBeenCalledWith(markers[0], 0);
    });
});

describe("BrazilMap — remaining branches", () => {
    async function renderLoaded(ui: Parameters<typeof render>[0]) {
        const view = render(ui);
        await waitFor(() => expect(view.container.querySelector("path[data-uf]")).toBeTruthy());
        return view;
    }

    it("tints states from the min/max ramp and keeps selected ones plain", async () => {
        const { container } = await renderLoaded(
            <BrazilMap values={{ SP: 100, AC: 0 }} selected="SP" onSelect={() => {}} />,
        );
        const ac = container.querySelector("path[data-uf='AC']") as SVGPathElement;
        const sp = container.querySelector("path[data-uf='SP']") as SVGPathElement;
        expect(ac.style.fill).toBeTruthy();
        expect(sp.style.fill).toBe("");
    });

    it("prefers a colorScale over the ramp", async () => {
        const colorScale = vi.fn(() => "rgb(9, 9, 9)");
        const { container } = await renderLoaded(
            <BrazilMap values={{ SP: 3 }} colorScale={colorScale} />,
        );
        expect((container.querySelector("path[data-uf='SP']") as SVGPathElement).style.fill).toBe(
            "rgb(9, 9, 9)",
        );
        expect(colorScale).toHaveBeenCalledWith(3);
    });

    it("handles a flat value range and an empty values map", async () => {
        const { container, unmount } = await renderLoaded(<BrazilMap values={{ SP: 5, RJ: 5 }} />);
        expect(
            (container.querySelector("path[data-uf='SP']") as SVGPathElement).style.fill,
        ).toBeTruthy();
        unmount();

        const { container: plain } = await renderLoaded(<BrazilMap values={{}} />);
        expect((plain.querySelector("path[data-uf='SP']") as SVGPathElement).style.fill).toBe("");
    });

    it("accepts an array of selected UFs", async () => {
        const { container } = await renderLoaded(
            <BrazilMap selected={["SP", "RJ"]} onSelect={() => {}} />,
        );
        expect(container.querySelector("path[data-uf='SP']")?.getAttribute("aria-pressed")).toBe(
            "true",
        );
        expect(container.querySelector("path[data-uf='RJ']")?.getAttribute("aria-pressed")).toBe(
            "true",
        );
        expect(container.querySelector("path[data-uf='AC']")?.getAttribute("aria-pressed")).toBe(
            "false",
        );
    });

    it("stays non-interactive without onSelect and selects with the keyboard when set", async () => {
        const { container, unmount } = await renderLoaded(<BrazilMap />);
        const plain = container.querySelector("path[data-uf='SP']") as SVGPathElement;
        expect(plain.getAttribute("role")).toBeNull();
        unmount();

        const onSelect = vi.fn();
        const { container: live } = await renderLoaded(<BrazilMap onSelect={onSelect} />);
        const path = live.querySelector("path[data-uf='SP']") as SVGPathElement;
        fireEvent.keyDown(path, { key: "Enter" });
        fireEvent.keyDown(path, { key: " " });
        fireEvent.keyDown(path, { key: "Shift" });
        expect(onSelect).toHaveBeenCalledTimes(2);
        expect(onSelect).toHaveBeenLastCalledWith("SP");
    });

    it("hides labels when showLabels is off", async () => {
        const { container } = await renderLoaded(<BrazilMap showLabels={false} />);
        expect(container.querySelectorAll("text").length).toBe(0);
    });

    it("renders a custom loading placeholder", () => {
        render(<BrazilMap loadingContent="Carregando UFs" />);
        expect(screen.getByText("Carregando UFs")).toBeInTheDocument();
    });

    it("honours a custom label, height and inline style", async () => {
        const { container } = await renderLoaded(
            <BrazilMap label="Mapa" height={700} style={{ opacity: 0.4 }} />,
        );
        const root = container.firstChild as HTMLElement;
        expect(screen.getByRole("group", { name: "Mapa" })).toBeInTheDocument();
        expect(root.style.height).toBe("700px");
        expect(root.style.opacity).toBe("0.4");
    });

    it("uses a custom renderTooltip", async () => {
        const { container } = await renderLoaded(
            <BrazilMap
                values={{ SP: 12 }}
                renderTooltip={(data) => <span>{`${data.uf}:${data.value ?? "-"}`}</span>}
            />,
        );
        fireEvent.mouseMove(container.querySelector("path[data-uf='SP']") as SVGPathElement);
        expect(await screen.findByText("SP:12")).toBeInTheDocument();
    });

    it("clears the tooltip on mouse leave", async () => {
        const { container } = await renderLoaded(<BrazilMap />);
        const path = container.querySelector("path[data-uf='SP']") as SVGPathElement;
        fireEvent.mouseMove(path);
        expect(await screen.findByTestId("map-tooltip")).toBeInTheDocument();
        fireEvent.mouseLeave(path);
        expect(screen.queryByTestId("map-tooltip")).not.toBeInTheDocument();
    });

    it("skips the marker overlay for an empty array", async () => {
        const { container } = await renderLoaded(<BrazilMap markers={[]} />);
        expect(container.querySelector("circle[data-marker-id]")).toBeNull();
    });
});

describe("BrazilMap — resize observation", () => {
    it("re-projects when the container reports a new width, ignoring zero", async () => {
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

        const { container } = render(<BrazilMap showLabels={false} />);
        await waitFor(() => expect(container.querySelector("path[data-uf]")).toBeTruthy());
        const viewBox = () => container.querySelector("svg")?.getAttribute("viewBox");
        expect(viewBox()).toContain("600");

        act(() => observers[0]?.([{ contentRect: { width: 820 } }]));
        expect(viewBox()).toContain("820");

        act(() => observers[0]?.([{ contentRect: { width: 0 } }]));
        expect(viewBox()).toContain("820");

        vi.stubGlobal("ResizeObserver", original);
    });

    it("renders without a ResizeObserver in the environment", async () => {
        const original = globalThis.ResizeObserver;
        vi.stubGlobal("ResizeObserver", undefined);
        const { container } = render(<BrazilMap showLabels={false} />);
        await waitFor(() => expect(container.querySelector("path[data-uf]")).toBeTruthy());
        vi.stubGlobal("ResizeObserver", original);
    });
});
