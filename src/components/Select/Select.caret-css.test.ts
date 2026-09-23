import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * jsdom computes no CSS, so the caret's geometry is guarded by reading the
 * sheets. Before #368 the caret sat at a literal `right: 12px` in `Select` and
 * `Combobox` (10px on the chip): measured in Chrome, 12px from the edge at every
 * density while the control went from 34 to 44px tall and its radius from 4 to
 * 12px.
 */
const read = (path: string): string => readFileSync(resolve(__dirname, "../..", path), "utf8");

/**
 * The declarations of every top-level rule whose selector is exactly `selector`.
 *
 * @param css - The stylesheet source.
 * @param selector - The selector, verbatim.
 * @returns Property → value, later rules overriding earlier ones.
 */
function rule(css: string, selector: string): Map<string, string> {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, "\\$&");
    const pattern = new RegExp(`^${escaped} \\{([^}]*)\\}`, "gm");
    const result = new Map<string, string>();
    for (const match of css.matchAll(pattern)) {
        for (const line of (match[1] ?? "").split(";")) {
            const [property, ...value] = line.split(":");
            if (property?.trim() && value.length > 0) {
                result.set(property.trim(), value.join(":").replace(/\s+/g, " ").trim());
            }
        }
    }
    return result;
}

const SELECT = read("components/Select/Select.module.css");
const COMBOBOX = read("components/Combobox/Combobox.module.css");
const DENSITY = read("styles/density.css");

describe("the caret follows the density tokens", () => {
    it.each(["comfortable", "compact", "touch", "spacious"])(
        "density %s declares both caret tokens",
        (density) => {
            const block = new RegExp(`\\[data-tempest-density="${density}"\\] \\{([^}]*)\\}`).exec(
                DENSITY,
            )?.[1];
            expect(block).toMatch(/--tempest-control-caret-offset: \d+px;/);
            expect(block).toMatch(/--tempest-control-caret-size: \d+px;/);
        },
    );

    it.each([
        ["Select", SELECT],
        ["Combobox", COMBOBOX],
    ])("%s positions and sizes the caret from the tokens, not a literal", (_, css) => {
        const caret = rule(css, ".caret");
        expect(caret.get("right")).toBe("var(--_tempest-caret-offset)");
        expect(caret.get("width")).toBe("var(--_tempest-caret-size)");
        expect(css).not.toMatch(/right: \d+px/);
        expect(rule(css, ".field").get("--_tempest-caret-offset")).toContain(
            "--tempest-control-caret-offset",
        );
    });

    it.each([
        ["Select", SELECT, ".select"],
        ["Combobox", COMBOBOX, ".input"],
    ])(
        "%s reserves the caret's lane from the same tokens, so moving the caret moves the text edge",
        (_, css, control) => {
            const padding = rule(css, control).get("padding") ?? "";
            expect(padding).toContain("var(--_tempest-caret-offset)");
            expect(padding).toContain("var(--_tempest-caret-size)");
        },
    );
});

describe("an app's svg rule cannot capture the caret", () => {
    /**
     * Measured in Chrome on the gallery: an app rule `.appfield svg { width:
     * 18.4px; height: 100% }` (specificity 0-1-1) stretched the caret from 14 to
     * 18.39px. The slot's own rule has to outrank that.
     */
    it.each([
        ["Select", SELECT],
        ["Combobox", COMBOBOX],
    ])("%s pins the svg with a selector above 0-1-1 and zero margin", (_, css) => {
        const svg = rule(css, ".field > .caret > svg");
        expect(svg.get("width")).toBe("100%");
        expect(svg.get("height")).toBe("100%");
        expect(svg.get("margin")).toBe("0");
    });
});

describe("the bare variant ships the mechanism without the look", () => {
    const bare = rule(SELECT, ".bare .select");

    it("clears the border, radius, shadow and fixed height the field paints", () => {
        expect(bare.get("border")).toBe("0");
        expect(bare.get("border-radius")).toBe("inherit");
        expect(bare.get("box-shadow")).toBe("none");
        expect(bare.get("height")).toBe("auto");
    });

    it("inherits background and color from the shell, which the native popup reads", () => {
        expect(bare.get("background-color")).toBe("inherit");
        expect(bare.get("color")).toBe("inherit");
        expect(rule(SELECT, ".bare .caret").get("color")).toBe("inherit");
    });

    it("keeps appearance none from the base rule and draws the focus ring on the shell", () => {
        expect(rule(SELECT, ".select").get("appearance")).toBe("none");
        expect(rule(SELECT, ".bare:focus-within").get("outline")).toContain(
            "--tempest-focus-ring-color",
        );
    });
});
