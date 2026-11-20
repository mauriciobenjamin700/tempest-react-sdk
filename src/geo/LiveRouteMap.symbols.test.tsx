import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/theme/color";
import { LiveRouteMap, type LiveRouteMarker } from "./LiveRouteMap";
import { LiveRouteMapLegend } from "./LiveRouteMapLegend";

const STOP: LiveRouteMarker = {
    id: "s",
    label: "Praça",
    kind: "stop",
    latitude: -23.56,
    longitude: -46.63,
};
const OTHER: LiveRouteMarker = {
    id: "o",
    label: "Terminal",
    kind: "origin",
    latitude: -23.55,
    longitude: -46.64,
};

function marker(container: HTMLElement, id: string): SVGGElement {
    const node = container.querySelector<SVGGElement>(`[data-marker-id='${id}']`);
    if (!node) throw new Error(`marker ${id} not rendered`);
    return node;
}

function shapeRadius(node: Element): number {
    const shape = node.querySelector("[class*='markerShape']");
    return Number(shape?.getAttribute("r"));
}

describe("LiveRouteMap — emphasis", () => {
    it("grows the emphasized marker and draws a halo, keeping its kind", () => {
        const { container } = render(
            <LiveRouteMap
                markers={[
                    { ...STOP, emphasis: true },
                    { ...OTHER, kind: "stop" },
                ]}
            />,
        );
        const emphasized = marker(container, "s");
        const plain = marker(container, "o");
        expect(emphasized.dataset.kind).toBe("stop");
        expect(emphasized.hasAttribute("data-emphasis")).toBe(true);
        expect(emphasized.querySelector("[data-emphasis-halo]")).not.toBeNull();
        expect(plain.querySelector("[data-emphasis-halo]")).toBeNull();
        expect(shapeRadius(emphasized)).toBeCloseTo(shapeRadius(plain) * 1.4);
    });

    it("keeps the focus ring outside the emphasis halo", () => {
        const { container } = render(<LiveRouteMap markers={[{ ...STOP, emphasis: true }]} />);
        const node = marker(container, "s");
        const halo = Number(node.querySelector("[data-emphasis-halo]")?.getAttribute("r"));
        const ring = Number(node.querySelector("[class*='focusRing']")?.getAttribute("r"));
        expect(ring).toBeGreaterThan(halo);
    });
});

describe("LiveRouteMap — content inside the glyph", () => {
    it("draws glyphText inside the shape and grows a stop to fit it", () => {
        const { container } = render(<LiveRouteMap markers={[{ ...STOP, glyphText: "2" }]} />);
        const node = marker(container, "s");
        expect(node.querySelector("text")?.textContent).toBe("2");
        expect(shapeRadius(node)).toBe(10);
    });

    it("leaves the accessible name to the label, so the order is not read twice", () => {
        render(<LiveRouteMap markers={[{ ...STOP, label: "Parada 2 — Praça", glyphText: "2" }]} />);
        expect(screen.getByRole("button", { name: "Parada 2 — Praça, parada" })).toBeTruthy();
    });

    it("draws an icon in a 24×24 box, and glyphText wins when both are set", () => {
        const icon = <path d="M4 22V4" data-testid="flag" />;
        const { container, rerender } = render(
            <LiveRouteMap markers={[{ ...STOP, kind: "destination", icon }]} />,
        );
        const box = marker(container, "s").querySelector("[data-glyph-icon]");
        expect(box?.getAttribute("viewBox")).toBe("0 0 24 24");
        expect(within(box as unknown as HTMLElement).getByTestId("flag")).toBeTruthy();

        rerender(
            <LiveRouteMap markers={[{ ...STOP, kind: "destination", icon, glyphText: "F" }]} />,
        );
        expect(marker(container, "s").querySelector("[data-glyph-icon]")).toBeNull();
        expect(marker(container, "s").querySelector("text")?.textContent).toBe("F");
    });

    it("replaces the origin dot with the content", () => {
        const { container } = render(<LiveRouteMap markers={[{ ...OTHER, glyphText: "1" }]} />);
        expect(marker(container, "o").querySelector("[class*='markerDot']")).toBeNull();
    });
});

describe("LiveRouteMap — touch target and markerScale", () => {
    it("takes the pointer in a 44 px circle at the default size", () => {
        const { container } = render(<LiveRouteMap markers={[STOP]} />);
        const hit = marker(container, "s").querySelector("[data-marker-hit]");
        expect(Number(hit?.getAttribute("r")) * 2).toBe(44);
    });

    it("scales the drawing in an inner group, leaving the outer transform to place it", () => {
        const { container } = render(<LiveRouteMap markers={[STOP]} markerScale={2} />);
        const node = marker(container, "s");
        expect(node.getAttribute("transform")).toMatch(/^translate\(/);
        const inner = node.querySelector("[data-marker-scale]");
        expect(inner?.getAttribute("transform")).toBe("scale(2)");
        expect(inner?.querySelector("[class*='markerShape']")).not.toBeNull();
    });

    it("grows the hit area with a large scale and never shrinks it below 44 px", () => {
        const { container, rerender } = render(<LiveRouteMap markers={[STOP]} markerScale={2} />);
        const hit = (): number =>
            Number(marker(container, "s").querySelector("[data-marker-hit]")?.getAttribute("r"));
        expect(hit()).toBe(32);
        rerender(<LiveRouteMap markers={[STOP]} markerScale={0.5} />);
        expect(hit()).toBe(22);
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
        "falls back to scale 1 for markerScale %s",
        (value) => {
            const { container } = render(<LiveRouteMap markers={[STOP]} markerScale={value} />);
            expect(marker(container, "s").querySelector("[data-marker-scale]")).toBeNull();
        },
    );

    it("opens the panel clear of a scaled glyph", () => {
        const withContent = { ...STOP, content: <p>3 embarcam</p> };
        const { container, rerender } = render(<LiveRouteMap markers={[withContent]} />);
        fireEvent.click(marker(container, "s"));
        const gap = (): string =>
            screen.getByRole("dialog").style.getPropertyValue("--tempest-live-route-panel-gap");
        expect(gap()).toBe("18.0px");
        rerender(<LiveRouteMap markers={[withContent]} markerScale={2} />);
        expect(gap()).toBe("36.0px");
    });
});

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

describe("LiveRouteMap — focus ring", () => {
    it("paints the focus ring only under :focus-visible, never at rest", () => {
        const painting = [...MAP_CSS.matchAll(/([^{}]+)\{[^}]*--tempest-focus-ring-color[^}]*\}/g)]
            .map((match) => match[1].trim())
            .filter((selector) => selector.includes("focusRing"));
        expect(painting).toEqual([".marker:focus-visible .focusRing"]);
        expect(rule(".focusRing")).toContain("stroke: transparent");
    });
});

describe("LiveRouteMap — colors that survive a partial theme", () => {
    it("paints the badge from a fixed neutral pair, not from --tempest-text over --tempest-bg", () => {
        expect(rule(".badge rect")).not.toMatch(/--tempest-text\b/);
        expect(rule(".badge text")).not.toMatch(/--tempest-bg\b/);
        expect(rule(".badge rect")).toContain("--tempest-gray-700");
        expect(rule(".badge text")).toContain("--tempest-neutral-on-solid");
    });

    it.each(["light", "dark"] as const)(
        "keeps badge and glyph ink at 4.5:1 in the %s theme",
        (theme) => {
            const pairs: [string, string][] = [
                ["--tempest-gray-700", "--tempest-neutral-on-solid"],
                ["--tempest-success-fg", "--tempest-surface"],
                ["--tempest-info-solid", "--tempest-info-on-solid"],
                ["--tempest-danger-solid", "--tempest-danger-on-solid"],
            ];
            for (const [fill, ink] of pairs) {
                const ratio = contrastRatio(token(theme, fill), token(theme, ink));
                expect(ratio, `${ink} on ${fill}`).toBeGreaterThanOrEqual(4.5);
            }
        },
    );

    it("pairs each kind's fill with the ink measured above", () => {
        expect(rule(".origin")).toContain("--tempest-surface");
        expect(rule(".stop")).toContain("--tempest-info-on-solid");
        expect(rule(".destination")).toContain("--tempest-danger-on-solid");
    });
});

describe("LiveRouteMapLegend", () => {
    it("lists every symbol the map draws by default, with PT-BR text", () => {
        render(<LiveRouteMapLegend />);
        const list = screen.getByRole("list", { name: "Legenda do mapa" });
        expect(
            within(list)
                .getAllByRole("listitem")
                .map((li) => li.textContent),
        ).toEqual([
            "Origem",
            "Parada",
            "Destino",
            "Veículo",
            "Rota planejada",
            "Trajeto percorrido",
        ]);
    });

    it("draws the same glyph the map draws for the same options", () => {
        const { container: map } = render(
            <LiveRouteMap markers={[{ ...STOP, emphasis: true, glyphText: "1" }]} />,
        );
        const { container: legend } = render(
            <LiveRouteMapLegend
                items={[{ symbol: "stop", label: "Seu embarque", emphasis: true, glyphText: "1" }]}
            />,
        );
        const fromMap = marker(map, "s").querySelector("[class*='markerShape']");
        const fromLegend = legend.querySelector("li [class*='markerShape']");
        expect(fromLegend?.getAttribute("r")).toBe(fromMap?.getAttribute("r"));
        expect(fromLegend?.closest("[class*='stop']")).not.toBeNull();
        expect(legend.querySelector("li [data-emphasis-halo]")).not.toBeNull();
        expect(legend.querySelector("li text")?.textContent).toBe("1");
    });

    it("hides the symbols from assistive tech and keeps the text", () => {
        const { container } = render(<LiveRouteMapLegend />);
        for (const svg of container.querySelectorAll("svg")) {
            expect(svg.getAttribute("aria-hidden")).toBe("true");
        }
    });

    it("scales marker symbols with markerScale and leaves lines and vehicle alone", () => {
        const items = [
            { symbol: "stop", label: "Parada" },
            { symbol: "vehicle", label: "Ônibus" },
        ] as const;
        const { container, rerender } = render(<LiveRouteMapLegend items={items} />);
        const widths = (): number[] =>
            [...container.querySelectorAll("svg")].map((svg) => Number(svg.getAttribute("width")));
        const [stop, vehicle] = widths();
        rerender(<LiveRouteMapLegend items={items} markerScale={2} />);
        expect(widths()).toEqual([stop * 2, vehicle]);
    });
});
