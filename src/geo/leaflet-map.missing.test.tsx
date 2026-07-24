import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LeafletTrajectory } from "./leaflet-map";

/**
 * `leaflet` is an optional peer dependency and is deliberately NOT installed in
 * this repo, so the dynamic import inside the component rejects for real here —
 * no mock needed. That is exactly the situation an app hits when it passes
 * `tileUrl` without installing leaflet, and the component must explain it
 * instead of throwing.
 */
describe("LeafletTrajectory without the leaflet peer", () => {
    it("renders an actionable message instead of crashing", async () => {
        render(
            <LeafletTrajectory
                points={[{ latitude: -23.55, longitude: -46.63 }]}
                tileUrl="https://t/{z}/{x}/{y}.png"
            />,
        );

        expect(await screen.findByText(/Leaflet não encontrado/)).toBeInTheDocument();
        expect(screen.getByText(/remova `tileUrl` para o plot SVG/)).toBeInTheDocument();
    });
});
