import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sparkline } from "./Sparkline";

const SERIES = [4, 8, 6, 12, 9, 15];

const chart = () => screen.getByRole("img");

describe("Sparkline — the accessible name", () => {
    it("describes the series, because there is no axis or legend to fall back on", () => {
        render(<Sparkline data={SERIES} />);
        const name = chart().getAttribute("aria-label") ?? "";
        expect(name).toContain("6 pontos");
        expect(name).toContain("subindo");
        expect(name).toContain("Início 4");
        expect(name).toContain("fim 15");
    });

    it("uses the caller's formatter in that description", () => {
        render(<Sparkline data={[1000, 2500]} valueFormatter={(v) => `R$ ${v / 100}`} />);
        expect(chart()).toHaveAccessibleName(/R\$ 10/);
    });

    it("accepts an explicit label when the surrounding text already says it", () => {
        render(<Sparkline data={SERIES} label="Receita, 6 meses" />);
        expect(chart()).toHaveAccessibleName("Receita, 6 meses");
    });

    it("is still named for an empty series", () => {
        render(<Sparkline data={[]} />);
        expect(chart()).toHaveAccessibleName("Sem dados");
    });
});

describe("Sparkline — marks", () => {
    it("draws a 2px round-capped line by default", () => {
        const { container } = render(<Sparkline data={SERIES} />);
        const path = container.querySelector("path");
        expect(path).toHaveAttribute("stroke-width", "2");
        expect(path).toHaveAttribute("stroke-linecap", "round");
        expect(path).toHaveAttribute("fill", "none");
    });

    it("adds a washed fill under the line in area mode", () => {
        const { container } = render(<Sparkline data={SERIES} variant="area" />);
        const paths = [...container.querySelectorAll("path")];
        expect(paths).toHaveLength(2);
        // The fill closes back to the baseline.
        expect(paths[0].getAttribute("d")).toMatch(/Z$/);
    });

    it("draws one rect per point in bar mode, and no line", () => {
        const { container } = render(<Sparkline data={SERIES} variant="bar" />);
        expect(container.querySelectorAll("rect")).toHaveLength(SERIES.length);
        expect(container.querySelector("path")).toBeNull();
    });

    it("rings the end marker in the surface colour so it stays legible on the line", () => {
        const { container } = render(<Sparkline data={SERIES} />);
        const dot = container.querySelector("circle");
        expect(dot).toHaveAttribute("stroke", "var(--tempest-bg)");
        expect(dot).toHaveAttribute("stroke-width", "2");
    });

    it("omits the end marker on bars, where every mark is already an endpoint", () => {
        const { container } = render(<Sparkline data={SERIES} variant="bar" />);
        expect(container.querySelector("circle")).toBeNull();
    });

    it("honours showEnd either way", () => {
        const { container: hidden } = render(<Sparkline data={SERIES} showEnd={false} />);
        expect(hidden.querySelector("circle")).toBeNull();
        const { container: shown } = render(<Sparkline data={SERIES} variant="bar" showEnd />);
        expect(shown.querySelector("circle")).not.toBeNull();
    });

    it("defaults to the first chart token, and takes any colour", () => {
        const { container } = render(<Sparkline data={SERIES} />);
        expect(container.querySelector("path")).toHaveAttribute("stroke", "var(--tempest-chart-1)");
        const { container: custom } = render(<Sparkline data={SERIES} color="tomato" />);
        expect(custom.querySelector("path")).toHaveAttribute("stroke", "tomato");
    });
});

describe("Sparkline — sizing and edge cases", () => {
    it("sizes the drawing box and matches the viewBox to it", () => {
        const { container } = render(<Sparkline data={SERIES} width={120} height={32} />);
        const svg = container.querySelector("svg");
        expect(svg).toHaveAttribute("width", "120");
        expect(svg).toHaveAttribute("viewBox", "0 0 120 32");
    });

    it("renders a named, empty chart for an empty series rather than crashing", () => {
        const { container } = render(<Sparkline data={[]} />);
        expect(container.querySelector("path")).toBeNull();
        expect(container.querySelector("circle")).toBeNull();
        expect(chart()).toBeInTheDocument();
    });

    it("still draws a mark for a single point", () => {
        const { container } = render(<Sparkline data={[5]} />);
        expect(container.querySelector("path")).not.toBeNull();
        expect(container.querySelector("circle")).not.toBeNull();
    });

    it("never emits NaN into the path when the series has holes", () => {
        const { container } = render(<Sparkline data={[1, Number.NaN, 5]} />);
        expect(container.querySelector("path")?.getAttribute("d")).not.toContain("NaN");
    });

    it("shares an axis across instances when min and max are given", () => {
        const { container: a } = render(<Sparkline data={[10]} min={0} max={100} />);
        const { container: b } = render(<Sparkline data={[90]} min={0} max={100} />);
        const y = (c: HTMLElement) => Number(c.querySelector("circle")?.getAttribute("cy"));
        expect(y(a)).toBeGreaterThan(y(b));
    });

    it("forwards className and DOM props to the wrapper", () => {
        const { container } = render(<Sparkline data={SERIES} className="x" data-testid="spark" />);
        const wrapper = container.firstElementChild as HTMLElement;
        expect(wrapper).toHaveClass("x");
        expect(wrapper).toHaveAttribute("data-testid", "spark");
    });
});
