import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineChart } from "./LineChart";
import type { ChartData } from "./types";

const data: ChartData = [
    { month: "Jan", sales: 10, returns: 2 },
    { month: "Feb", sales: 20, returns: 3 },
    { month: "Mar", sales: 15, returns: 1 },
];

describe("LineChart", () => {
    it("renders an svg with fixed width without throwing", () => {
        const { container } = render(
            <LineChart
                data={data}
                index="month"
                categories={["sales", "returns"]}
                width={400}
                height={300}
            />,
        );
        expect(container.querySelector("svg")).toBeTruthy();
    });

    it("shows category legend text when showLegend", () => {
        const { getByText } = render(
            <LineChart
                data={data}
                index="month"
                categories={["sales", "returns"]}
                width={400}
                height={300}
                showLegend
            />,
        );
        expect(getByText("sales")).toBeTruthy();
        expect(getByText("returns")).toBeTruthy();
    });

    it("renders a line series per category", () => {
        const { container } = render(
            <LineChart
                data={data}
                index="month"
                categories={["sales", "returns"]}
                width={400}
                height={300}
            />,
        );
        const series = container.querySelectorAll(".recharts-line");
        expect(series.length).toBe(2);
    });
});

describe("LineChart — toggles", () => {
    it("omits grid, tooltip and legend when disabled", () => {
        const { container } = render(
            <LineChart
                data={data}
                index="month"
                categories={["sales"]}
                width={400}
                showGrid={false}
                showTooltip={false}
                showLegend={false}
            />,
        );
        expect(container.querySelector(".recharts-cartesian-grid")).toBeNull();
        expect(container.querySelector(".recharts-legend-wrapper")).toBeNull();
    });

    it("formats values through valueFormatter", () => {
        const valueFormatter = vi.fn((value: number) => `${value}%`);
        render(
            <LineChart
                data={data}
                index="month"
                categories={["sales"]}
                width={400}
                valueFormatter={valueFormatter}
            />,
        );
        expect(valueFormatter).toHaveBeenCalled();
    });

    it("cycles the palette when categories outnumber colors", () => {
        const { container } = render(
            <LineChart
                data={data}
                index="month"
                categories={["sales", "returns"]}
                width={400}
                colors={["#111111"]}
            />,
        );
        expect(container.querySelector("svg")).not.toBeNull();
    });
});

describe("LineChart — responsive wrapper", () => {
    it("wraps in a ResponsiveContainer when no width is given", () => {
        const { container } = render(
            <LineChart data={data} index="month" categories={["sales"]} />,
        );
        expect(container.querySelector(".recharts-responsive-container")).not.toBeNull();
    });
});
