import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrajectoryMap } from "./TrajectoryMap";
import type { Coordinate } from "./types";

const PATH: Coordinate[] = [
    { latitude: -23.55, longitude: -46.63 },
    { latitude: -23.56, longitude: -46.64 },
    { latitude: -23.57, longitude: -46.65 },
];

describe("TrajectoryMap", () => {
    it("renders an empty state with no points", () => {
        render(<TrajectoryMap points={[]} />);
        expect(screen.getByText(/sem pontos de trajetória/i)).toBeInTheDocument();
    });

    it("renders a polyline path for the SVG mode", () => {
        render(<TrajectoryMap points={PATH} label="Rota" />);
        const path = screen.getByTestId("trajectory-path");
        expect(path).toBeInTheDocument();
        // Three coordinates → three "x,y" pairs in the points attribute.
        expect(path.getAttribute("points")?.trim().split(" ")).toHaveLength(3);
    });

    it("exposes an accessible label", () => {
        render(<TrajectoryMap points={PATH} label="Minha rota" />);
        expect(screen.getByRole("img", { name: "Minha rota" })).toBeInTheDocument();
    });

    it("applies a custom stroke color to the path", () => {
        render(<TrajectoryMap points={PATH} strokeColor="#ff0000" />);
        expect(screen.getByTestId("trajectory-path").getAttribute("stroke")).toBe("#ff0000");
    });
});
