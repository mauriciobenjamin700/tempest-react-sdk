import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/theme/color";
import { LiveRouteMap, type LiveRouteMarker } from "./LiveRouteMap";
import { LiveRouteMapLegend } from "./LiveRouteMapLegend";

const STOP: LiveRouteMarker = {
    id: "s",
    label: "Parada 1, Praça",
    kind: "stop",
    glyphText: "1",
    latitude: -23.56,
    longitude: -46.63,
};
const NEXT: LiveRouteMarker = {
    id: "n",
    label: "Parada 2, Terminal",
    kind: "stop",
    glyphText: "2",
    latitude: -23.55,
    longitude: -46.64,
};
const POSITION = { latitude: -23.555, longitude: -46.635 };

const MAP_CSS = readFileSync(join(process.cwd(), "src/geo/LiveRouteMap.module.css"), "utf8");
const COLORS = readFileSync(join(process.cwd(), "src/styles/colors.css"), "utf8");

/** The declarations of one rule of the map stylesheet. */
function rule(selector: string): string {
    const start = MAP_CSS.indexOf(`${selector} {`);
    expect(start, `${selector} missing`).toBeGreaterThan(-1);
    return MAP_CSS.slice(start, MAP_CSS.indexOf("}", start));
}

/** Resolve a color token in one theme to hex, following `var()` through the light block. */
function token(theme: "light" | "dark", name: string): string {
    const dark = COLORS.slice(COLORS.indexOf('[data-tempest-theme="dark"]'));
    const blocks = theme === "dark" ? [dark, COLORS] : [COLORS];
    for (const source of blocks) {
        const match = new RegExp(`${name}:\\s*([^;]+);`).exec(source);
        if (!match) continue;
        const value = match[1].trim();
        const ref = /^var\((--[\w-]+)\)$/.exec(value);
        return ref ? token(theme, ref[1]) : value;
    }
    throw new Error(`${name} not found`);
}

describe("LiveRouteMap — visited markers", () => {
    it("marks a visited stop apart from the ones ahead, keeping its kind", () => {
        const { container } = render(<LiveRouteMap markers={[{ ...STOP, visited: true }, NEXT]} />);
        const visited = container.querySelector<SVGGElement>("[data-marker-id='s']");
        const ahead = container.querySelector<SVGGElement>("[data-marker-id='n']");
        expect(visited?.dataset.kind).toBe("stop");
        expect(visited?.hasAttribute("data-visited")).toBe(true);
        expect(visited?.getAttribute("class")).toMatch(/visited/);
        expect(ahead?.hasAttribute("data-visited")).toBe(false);
        expect(ahead?.getAttribute("class")).not.toMatch(/visited/);
    });

    it("says a visited marker was visited, so the label no longer has to", () => {
        render(<LiveRouteMap markers={[{ ...STOP, visited: true, badge: 2 }, NEXT]} />);
        expect(
            screen.getByRole("button", { name: "Parada 1, Praça, parada, visita concluída, 2" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Parada 2, Terminal, parada" }),
        ).toBeInTheDocument();
    });

    it("speaks visitedLabel in the app's language", () => {
        render(
            <LiveRouteMap
                markers={[{ ...STOP, visited: true }]}
                kindLabels={{ stop: "stop" }}
                visitedLabel="served"
            />,
        );
        expect(
            screen.getByRole("button", { name: "Parada 1, Praça, stop, served" }),
        ).toBeInTheDocument();
    });
});

describe("LiveRouteMap — stale vehicle", () => {
    it("draws a stale vehicle neutral and says so to a screen reader", () => {
        render(
            <LiveRouteMap
                markers={[STOP]}
                vehicle={{ position: POSITION, heading: 90, label: "Van 12", stale: true }}
                animationMs={0}
            />,
        );
        const vehicle = screen.getByTestId("live-route-vehicle");
        expect(vehicle.hasAttribute("data-stale")).toBe(true);
        expect(vehicle.getAttribute("class")).toMatch(/vehicleStale/);
        expect(vehicle).toHaveAccessibleName("Van 12, posição desatualizada");
    });

    it("keeps a fresh vehicle exactly as before", () => {
        render(
            <LiveRouteMap
                markers={[STOP]}
                vehicle={{ position: POSITION, label: "Van 12" }}
                animationMs={0}
            />,
        );
        const vehicle = screen.getByTestId("live-route-vehicle");
        expect(vehicle.hasAttribute("data-stale")).toBe(false);
        expect(vehicle.getAttribute("class")).not.toMatch(/vehicleStale/);
        expect(vehicle).toHaveAccessibleName("Van 12");
    });

    it("uses staleLabel when the app gives one", () => {
        render(
            <LiveRouteMap
                markers={[STOP]}
                vehicle={{ position: POSITION, stale: true, staleLabel: "no signal for 4 min" }}
                animationMs={0}
            />,
        );
        expect(screen.getByTestId("live-route-vehicle")).toHaveAccessibleName(
            "Veículo, no signal for 4 min",
        );
    });

    it("keeps the stale vehicle where it was last seen", () => {
        const { rerender } = render(
            <LiveRouteMap markers={[STOP]} vehicle={{ position: POSITION }} animationMs={0} />,
        );
        const before = screen.getByTestId("live-route-vehicle").getAttribute("transform");
        rerender(
            <LiveRouteMap
                markers={[STOP]}
                vehicle={{ position: POSITION, stale: true }}
                animationMs={0}
            />,
        );
        expect(screen.getByTestId("live-route-vehicle").getAttribute("transform")).toBe(before);
    });
});

describe("LiveRouteMap — colors of the past states", () => {
    it("paints visited markers and the stale vehicle from overridable neutral tokens", () => {
        expect(rule(".visited")).toContain(
            "--tempest-live-route-visited, var(--tempest-text-muted)",
        );
        expect(rule(".visited")).toContain(
            "--tempest-live-route-visited-ink, var(--tempest-surface)",
        );
        expect(rule(".vehicleStale .vehicleBody")).toContain(
            "--tempest-live-route-stale, var(--tempest-text-muted)",
        );
        expect(rule(".vehicleStale .vehicleMark")).toContain(
            "--tempest-live-route-stale-ink, var(--tempest-surface)",
        );
    });

    it("declares .visited after the kinds, so it wins over the kind color", () => {
        const visited = MAP_CSS.indexOf(".visited {");
        for (const kind of [".origin {", ".stop {", ".destination {"]) {
            expect(MAP_CSS.indexOf(kind)).toBeLessThan(visited);
        }
    });

    it.each(["light", "dark"] as const)(
        "keeps the neutral shape at 3:1 on the map and its ink at 4.5:1 in the %s theme",
        (theme) => {
            const fill = token(theme, "--tempest-text-muted");
            expect(contrastRatio(fill, token(theme, "--tempest-surface-2"))).toBeGreaterThanOrEqual(
                3,
            );
            expect(contrastRatio(fill, token(theme, "--tempest-surface"))).toBeGreaterThanOrEqual(
                4.5,
            );
        },
    );
});

describe("LiveRouteMapLegend — states and badge", () => {
    it("explains the count badge with the map's own pill", () => {
        const { container: map } = render(<LiveRouteMap markers={[{ ...STOP, badge: 3 }]} />);
        const { container: legend } = render(
            <LiveRouteMapLegend items={[{ symbol: "badge", label: "Embarques", badge: 3 }]} />,
        );
        const fromMap = map.querySelector("[data-marker-badge='s'] [class*='badge']");
        const fromLegend = legend.querySelector("li [class*='badge']");
        expect(fromLegend?.getAttribute("class")).toBe(fromMap?.getAttribute("class"));
        expect(fromLegend?.querySelector("rect")?.getAttribute("width")).toBe(
            fromMap?.querySelector("rect")?.getAttribute("width"),
        );
        expect(fromLegend?.textContent).toBe("3");
        expect(legend.querySelector("li")?.dataset.symbol).toBe("badge");
    });

    it("sizes the badge entry to hold 99+ and draws 1 when no count is given", () => {
        const { container } = render(
            <LiveRouteMapLegend
                items={[
                    { symbol: "badge", label: "Um" },
                    { symbol: "badge", label: "Muitos", badge: 150 },
                ]}
            />,
        );
        const [one, many] = [...container.querySelectorAll("li")];
        expect(one?.querySelector("text")?.textContent).toBe("1");
        expect(many?.querySelector("text")?.textContent).toBe("99+");
        const width = (li: Element | undefined): number =>
            Number(li?.querySelector("svg")?.getAttribute("width"));
        const pill = Number(many?.querySelector("rect")?.getAttribute("width"));
        expect(width(many)).toBeGreaterThanOrEqual(pill);
        expect(width(many)).toBeGreaterThan(width(one));
    });

    it("draws visited and stale entries with the map's state classes", () => {
        render(
            <LiveRouteMapLegend
                items={[
                    { symbol: "stop", label: "Parada atendida", visited: true, glyphText: "1" },
                    { symbol: "vehicle", label: "Sem sinal", stale: true },
                ]}
            />,
        );
        const list = screen.getByRole("list");
        const [visited, stale] = within(list).getAllByRole("listitem");
        expect(visited?.querySelector("[class*='visited']")).not.toBeNull();
        expect(stale?.querySelector("[class*='vehicleStale']")).not.toBeNull();
    });
});
