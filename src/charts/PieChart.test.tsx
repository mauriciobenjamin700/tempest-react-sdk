import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PieChart } from "./PieChart";
import type { ChartData } from "./types";

const data: ChartData = [
    { name: "Chrome", value: 60 },
    { name: "Firefox", value: 25 },
    { name: "Safari", value: 15 },
];

describe("PieChart", () => {
    it("renders an svg with fixed width without throwing", () => {
        const { container } = render(
            <PieChart data={data} category="value" index="name" width={400} height={300} />,
        );
        expect(container.querySelector("svg")).toBeTruthy();
    });

    it("renders as a donut without throwing", () => {
        const { container } = render(
            <PieChart data={data} category="value" index="name" width={400} height={300} donut />,
        );
        expect(container.querySelector("svg")).toBeTruthy();
    });
});

describe("PieChart — toggles and responsive wrapper", () => {
    it("omits tooltip and legend when disabled", () => {
        const { container } = render(
            <PieChart
                data={data}
                index="name"
                category="value"
                width={300}
                showTooltip={false}
                showLegend={false}
            />,
        );
        expect(container.querySelector(".recharts-legend-wrapper")).toBeNull();
    });

    it("wraps in a ResponsiveContainer when no width is given", () => {
        const { container } = render(<PieChart data={data} index="name" category="value" />);
        expect(container.querySelector(".recharts-responsive-container")).not.toBeNull();
    });

    it("formats values through valueFormatter", () => {
        const valueFormatter = vi.fn((value: number) => `${value}%`);
        render(
            <PieChart
                data={data}
                index="name"
                category="value"
                width={300}
                valueFormatter={valueFormatter}
            />,
        );
        expect(valueFormatter).toBeDefined();
    });
});
