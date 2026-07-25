import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CHART_COLORS } from "./palette";
import { useChartColors } from "./use-chart-colors";

function Probe({ explicit, element }: { explicit?: string[]; element?: Element | null }) {
    const colors = useChartColors(explicit, element);
    return <output data-testid="colors">{colors.join(",")}</output>;
}

afterEach(() => {
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-tempest-theme");
});

describe("useChartColors", () => {
    it("returns the default palette when no token is set", () => {
        render(<Probe />);
        expect(screen.getByTestId("colors")).toHaveTextContent(DEFAULT_CHART_COLORS.join(","));
    });

    it("returns the resolved tokens", () => {
        document.documentElement.style.setProperty("--tempest-chart-1", "#111111");
        document.documentElement.style.setProperty("--tempest-chart-2", "#222222");

        render(<Probe />);
        expect(screen.getByTestId("colors")).toHaveTextContent("#111111,#222222");
    });

    it("re-resolves when the theme attribute flips", async () => {
        document.documentElement.style.setProperty("--tempest-chart-1", "#light0");
        render(<Probe />);
        expect(screen.getByTestId("colors")).toHaveTextContent("#light0");

        // MutationObserver delivers on a microtask, so the flush has to be awaited.
        await act(async () => {
            document.documentElement.style.setProperty("--tempest-chart-1", "#dark00");
            document.documentElement.setAttribute("data-tempest-theme", "dark");
        });

        expect(screen.getByTestId("colors")).toHaveTextContent("#dark00");
    });

    it("returns explicit colors untouched and ignores the tokens", () => {
        document.documentElement.style.setProperty("--tempest-chart-1", "#111111");

        render(<Probe explicit={["#ff0000"]} />);
        expect(screen.getByTestId("colors")).toHaveTextContent("#ff0000");
    });

    it("does not observe the theme when colors are explicit", async () => {
        render(<Probe explicit={["#ff0000"]} />);

        await act(async () => {
            document.documentElement.setAttribute("data-tempest-theme", "dark");
            document.documentElement.style.setProperty("--tempest-chart-1", "#00ff00");
        });

        expect(screen.getByTestId("colors")).toHaveTextContent("#ff0000");
    });

    it("resolves against an explicit element", () => {
        const host = document.createElement("div");
        host.style.setProperty("--tempest-chart-1", "#abcabc");
        document.body.appendChild(host);

        render(<Probe element={host} />);
        expect(screen.getByTestId("colors")).toHaveTextContent("#abcabc");

        host.remove();
    });

    it("falls back to the default palette when the element is null", () => {
        render(<Probe element={null} />);
        expect(screen.getByTestId("colors")).toHaveTextContent(DEFAULT_CHART_COLORS.join(","));
    });
});
