import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RadarChart } from "./RadarChart";
import type { ChartData } from "./types";

const data: ChartData = [
    { skill: "Speed", alice: 80, bob: 60 },
    { skill: "Power", alice: 70, bob: 90 },
    { skill: "Range", alice: 50, bob: 75 },
];

describe("RadarChart", () => {
    it("renders an svg with fixed width without throwing", () => {
        const { container } = render(
            <RadarChart
                data={data}
                index="skill"
                categories={["alice", "bob"]}
                width={400}
                height={300}
            />,
        );
        expect(container.querySelector("svg")).toBeTruthy();
    });

    it("renders a radar series per category", () => {
        const { container } = render(
            <RadarChart
                data={data}
                index="skill"
                categories={["alice", "bob"]}
                width={400}
                height={300}
            />,
        );
        const series = container.querySelectorAll(".recharts-radar");
        expect(series.length).toBe(2);
    });
});

describe("RadarChart — toggles and responsive wrapper", () => {
    it("omits tooltip and legend when disabled", () => {
        const { container } = render(
            <RadarChart
                data={data}
                index="skill"
                categories={["alice"]}
                width={300}
                showTooltip={false}
                showLegend={false}
            />,
        );
        expect(container.querySelector(".recharts-legend-wrapper")).toBeNull();
    });

    it("wraps in a ResponsiveContainer when no width is given", () => {
        const { container } = render(
            <RadarChart data={data} index="skill" categories={["alice"]} />,
        );
        expect(container.querySelector(".recharts-responsive-container")).not.toBeNull();
    });
});
