import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
