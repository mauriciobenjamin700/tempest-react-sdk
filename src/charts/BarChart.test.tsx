import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarChart } from "./BarChart";
import type { ChartData } from "./types";

const data: ChartData = [
    { month: "Jan", sales: 10, returns: 2 },
    { month: "Feb", sales: 20, returns: 3 },
    { month: "Mar", sales: 15, returns: 1 },
];

describe("BarChart", () => {
    it("renders an svg with fixed width without throwing", () => {
        const { container } = render(
            <BarChart
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
            <BarChart
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

    it("renders a bar series group per category", () => {
        const { container } = render(
            <BarChart
                data={data}
                index="month"
                categories={["sales", "returns"]}
                width={400}
                height={300}
            />,
        );
        const series = container.querySelectorAll(".recharts-bar");
        expect(series.length).toBe(2);
    });
});
