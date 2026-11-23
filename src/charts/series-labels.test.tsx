import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { AreaChart } from "./AreaChart";
import { BarChart } from "./BarChart";
import { LineChart } from "./LineChart";
import { RadarChart } from "./RadarChart";
import type { CartesianChartProps, ChartData } from "./types";

const data: ChartData = [
    { day: "seg", done: 12, noShow: 2 },
    { day: "ter", done: 9, noShow: 1 },
];

const charts: Array<[string, ComponentType<CartesianChartProps>]> = [
    ["AreaChart", AreaChart],
    ["BarChart", BarChart],
    ["LineChart", LineChart],
    ["RadarChart", RadarChart],
];

describe.each(charts)("%s — labels", (_name, Chart) => {
    it("shows the label in the legend while the data keeps its own keys", () => {
        const { getByText, queryByText } = render(
            <Chart
                data={data}
                index="day"
                categories={["done", "noShow"]}
                labels={{ done: "Attended", noShow: "No-show" }}
                width={400}
                height={300}
            />,
        );
        expect(getByText("Attended")).toBeTruthy();
        expect(getByText("No-show")).toBeTruthy();
        expect(queryByText("done")).toBeNull();
        expect(queryByText("noShow")).toBeNull();
    });

    it("falls back to the key for a category the labels do not name", () => {
        const { getByText } = render(
            <Chart
                data={data}
                index="day"
                categories={["done", "noShow"]}
                labels={{ done: "Attended" }}
                width={400}
                height={300}
            />,
        );
        expect(getByText("Attended")).toBeTruthy();
        expect(getByText("noShow")).toBeTruthy();
    });
});

describe.each([
    ["AreaChart", AreaChart],
    ["BarChart", BarChart],
    ["LineChart", LineChart],
] as const)("%s — value axis", (_name, Chart) => {
    it("formats the axis ticks with yAxisFormatter instead of valueFormatter", () => {
        const { container } = render(
            <Chart
                data={data}
                index="day"
                categories={["done"]}
                valueFormatter={(value) => `full ${value}`}
                yAxisFormatter={(value) => `axis ${value}`}
                yAxisWidth={80}
                width={400}
                height={300}
            />,
        );
        const ticks = [...container.querySelectorAll("text[orientation='left']")].map(
            (tick) => tick.textContent,
        );
        expect(ticks.length).toBeGreaterThan(0);
        expect(ticks.every((tick) => tick?.startsWith("axis "))).toBe(true);
    });

    it("formats the axis ticks with valueFormatter when no axis formatter is given", () => {
        const { container } = render(
            <Chart
                data={data}
                index="day"
                categories={["done"]}
                valueFormatter={(value) => `full ${value}`}
                width={400}
                height={300}
            />,
        );
        const ticks = [...container.querySelectorAll("text[orientation='left']")].map(
            (tick) => tick.textContent,
        );
        expect(ticks.length).toBeGreaterThan(0);
        expect(ticks.every((tick) => tick?.startsWith("full "))).toBe(true);
    });
});
