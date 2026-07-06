import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapLegend } from "./MapLegend";

describe("MapLegend", () => {
    it("renders a continuous gradient with min/mid/max ticks", () => {
        render(<MapLegend title="Vendas" min={0} max={100} />);
        expect(screen.getByText("Vendas")).toBeInTheDocument();
        expect(screen.getByText("0")).toBeInTheDocument();
        expect(screen.getByText("50")).toBeInTheDocument();
        expect(screen.getByText("100")).toBeInTheDocument();
    });

    it("formats ticks with the provided formatter", () => {
        render(<MapLegend min={0} max={1000} format={(v) => `${v / 1000}k`} />);
        expect(screen.getByText("1k")).toBeInTheDocument();
    });

    it("renders discrete swatches when items are given", () => {
        render(
            <MapLegend
                items={[
                    { color: "#c6dbef", label: "< 10" },
                    { color: "#08519c", label: "> 50" },
                ]}
            />,
        );
        expect(screen.getByText("< 10")).toBeInTheDocument();
        expect(screen.getByText("> 50")).toBeInTheDocument();
    });
});
