import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
