import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Inherited properties a panel stops receiving once it is portalled.
 *
 * In flow, a panel inherits these from the component's root; in a portal it
 * inherits them from `body`. The `Combobox` list lost `font-family` that way and
 * rendered its options in the browser's default serif (measured in Chrome:
 * `"Times New Roman"` against the SDK's sans stack in flow). jsdom computes no
 * CSS, so no component test can see it — this reads the stylesheets instead.
 */
const INHERITED = [
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "color",
    "letter-spacing",
] as const;

/** Each portalled panel: the component's root class and the panel's own class. */
const PANELS = [
    { component: "Combobox", root: "wrapper", panel: "menu" },
    { component: "MultiSelect", root: "wrapper", panel: "menu" },
    { component: "NavigationMenu", root: "root", panel: "panel" },
    { component: "Menubar", root: "root", panel: "panel" },
    { component: "HoverCard", root: "root", panel: "card" },
    { component: "DropdownMenu", root: "root", panel: "menu" },
    { component: "Popover", root: "root", panel: "popover" },
    { component: "Tooltip", root: "trigger", panel: "bubble" },
] as const;

/**
 * The declarations of a top-level rule whose selector is exactly `.name`.
 *
 * @param css - The stylesheet source.
 * @param name - The class name, without the dot.
 * @returns Property → value; empty when the rule does not exist.
 */
function declarations(css: string, name: string): Map<string, string> {
    const match = new RegExp(`^\\.${name} \\{([^}]*)\\}`, "m").exec(css);
    const result = new Map<string, string>();
    for (const line of (match?.[1] ?? "").split(";")) {
        const [property, ...value] = line.split(":");
        if (property && value.length > 0) result.set(property.trim(), value.join(":").trim());
    }
    return result;
}

describe("portalled panels keep what they used to inherit", () => {
    it.each(PANELS)(
        "$component: every inherited property its root sets reaches the portalled panel",
        ({ component, root, panel }) => {
            const css = readFileSync(
                resolve(__dirname, `../src/components/${component}/${component}.module.css`),
                "utf8",
            );
            const fromRoot = declarations(css, root);
            const onPanel = new Map([
                ...declarations(css, panel),
                ...declarations(css, "portalled"),
            ]);
            const missing = INHERITED.filter(
                (property) =>
                    fromRoot.has(property) && onPanel.get(property) !== fromRoot.get(property),
            ).map((property) => `${property}: ${fromRoot.get(property)}`);
            expect(missing).toEqual([]);
        },
    );

    it("reads the rules it checks — the parser finds the root's font on Combobox", () => {
        const css = readFileSync(
            resolve(__dirname, "../src/components/Combobox/Combobox.module.css"),
            "utf8",
        );
        expect(declarations(css, "wrapper").get("font-family")).toBe("var(--tempest-font-sans)");
    });
});

/**
 * Overlays portalled into `body` with no in-flow root to copy from.
 *
 * Their text inherits whatever `body` declares, and the SDK does not declare a
 * font on `body` (that is the app's call, see `docs/styles.md`). In an app that
 * sets none, the `Drawer` title rendered in `"Times New Roman"` while every
 * in-flow component used the SDK stack (#716, measured in Chromium with the
 * gallery's body font removed). `BottomSheet` already declared the font on its
 * surface; these are the siblings that did not.
 */
const SURFACES = [
    { component: "Drawer", surface: "panel" },
    { component: "Modal", surface: "dialog" },
    { component: "Command", surface: "dialog" },
    { component: "BottomSheet", surface: "sheet" },
] as const;

describe("body-portalled overlays declare the SDK font themselves", () => {
    it.each(SURFACES)(
        "$component.$surface sets font-family to the SDK stack",
        ({ component, surface }) => {
            const css = readFileSync(
                resolve(__dirname, `../src/components/${component}/${component}.module.css`),
                "utf8",
            );
            expect(declarations(css, surface).get("font-family")).toBe("var(--tempest-font-sans)");
        },
    );
});
