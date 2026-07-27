import { render, screen } from "@testing-library/react";
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";

import { QRCode } from "./QRCode";

const chart = () => screen.getByRole("img");

/**
 * Read the rendered SVG back the way a scanner would.
 *
 * The path is walked rather than the matrix inspected: this proves the symbol
 * that actually reaches the DOM is scannable, which is the only property that
 * matters. A correct encoder behind a broken path is still an unusable QR.
 */
function decodeRendered(container: HTMLElement): string | null {
    const svg = container.querySelector("svg") as SVGSVGElement;
    const side = Number(svg.getAttribute("viewBox")?.split(" ")[2]);
    const path = svg.querySelector("path")?.getAttribute("d") ?? "";

    const scale = 4;
    const pixels = side * scale;
    const data = new Uint8ClampedArray(pixels * pixels * 4).fill(255);

    for (const match of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
        const x = Number(match[1]);
        const y = Number(match[2]);
        const run = Number(match[3]);
        for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < run * scale; dx++) {
                const at = ((y * scale + dy) * pixels + (x * scale + dx)) * 4;
                data[at] = 0;
                data[at + 1] = 0;
                data[at + 2] = 0;
            }
        }
    }

    return jsQR(data, pixels, pixels)?.data ?? null;
}

describe("QRCode — what the DOM actually carries", () => {
    it("renders a symbol that decodes back to the value", () => {
        const { container } = render(<QRCode value="https://tempest.dev" />);
        expect(decodeRendered(container)).toBe("https://tempest.dev");
    });

    it("still decodes at the strongest correction level", () => {
        const { container } = render(<QRCode value="pedido-99312" level="H" />);
        expect(decodeRendered(container)).toBe("pedido-99312");
    });

    it("draws every dark module in one path, not one element each", () => {
        const { container } = render(<QRCode value="https://tempest.dev" />);
        expect(container.querySelectorAll("path")).toHaveLength(1);
        expect(container.querySelectorAll("rect")).toHaveLength(1);
    });
});

describe("QRCode — accessibility", () => {
    it("names itself with the payload, which a screen reader cannot scan", () => {
        render(<QRCode value="https://tempest.dev/convite/9931" />);
        expect(chart()).toHaveAccessibleName("QR code: https://tempest.dev/convite/9931");
    });

    it("takes a caller-supplied name for an opaque payload", () => {
        render(<QRCode value="00020126580014BR.GOV.BCB.PIX" label="QR do Pix — R$ 42,00" />);
        expect(chart()).toHaveAccessibleName("QR do Pix — R$ 42,00");
    });
});

describe("QRCode — rendering", () => {
    it("sizes the box and matches the viewBox to the module count", () => {
        const { container } = render(<QRCode value="oi" size={200} margin={4} />);
        const svg = container.querySelector("svg") as SVGSVGElement;
        expect(svg).toHaveAttribute("width", "200");
        // Version 1 is 21 modules, plus a 4-module quiet zone on each side.
        expect(svg).toHaveAttribute("viewBox", "0 0 29 29");
    });

    it("honours the quiet zone", () => {
        const { container } = render(<QRCode value="oi" margin={0} />);
        expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 21 21");
    });

    it("stays black on white, ignoring the theme tokens on purpose", () => {
        // Wiring the modules to --tempest-text would flip them light in dark
        // mode, leaving a light symbol on a white ground: unscannable.
        const { container } = render(<QRCode value="oi" />);
        expect(container.querySelector("rect")).toHaveAttribute("fill", "#ffffff");
        expect(container.querySelector("path")).toHaveAttribute("fill", "#000000");
    });

    it("takes explicit colours", () => {
        const { container } = render(<QRCode value="oi" color="#003366" background="#eef" />);
        expect(container.querySelector("path")).toHaveAttribute("fill", "#003366");
        expect(container.querySelector("rect")).toHaveAttribute("fill", "#eef");
    });

    it("renders crisp edges rather than antialiasing the modules", () => {
        const { container } = render(<QRCode value="oi" />);
        expect(container.querySelector("svg")).toHaveAttribute("shape-rendering", "crispEdges");
    });

    it("grows the symbol for a longer payload while the box stays put", () => {
        const { container: small } = render(<QRCode value="oi" size={160} />);
        const { container: large } = render(<QRCode value={"x".repeat(300)} size={160} />);
        const modules = (c: HTMLElement) =>
            Number(c.querySelector("svg")?.getAttribute("viewBox")?.split(" ")[2]);
        expect(modules(large)).toBeGreaterThan(modules(small));
        expect(large.querySelector("svg")).toHaveAttribute("width", "160");
    });

    it("forwards className and DOM props to the wrapper", () => {
        const { container } = render(<QRCode value="oi" className="x" data-testid="qr" />);
        const wrapper = container.firstElementChild as HTMLElement;
        expect(wrapper).toHaveClass("x");
        expect(wrapper).toHaveAttribute("data-testid", "qr");
    });

    it("surfaces an oversized payload instead of drawing an unscannable symbol", () => {
        expect(() => render(<QRCode value={"x".repeat(5000)} level="H" />)).toThrow(
            /does not fit/i,
        );
    });
});
