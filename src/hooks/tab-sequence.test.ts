import { afterEach, describe, expect, it } from "vitest";
import { registerPortalLayer, tabRegion, tabSequence, tabbables } from "./tab-sequence";

/**
 * Create a button with a label, for sequences that read like the page.
 *
 * @param label - The button text.
 * @returns The button.
 */
function button(label: string): HTMLButtonElement {
    const el = document.createElement("button");
    el.textContent = label;
    return el;
}

/**
 * Labels of a sequence, in order.
 *
 * @param sequence - Elements to label.
 * @returns Their text.
 */
function labels(sequence: HTMLElement[]): string[] {
    return sequence.map((el) => el.textContent ?? "");
}

const cleanups: Array<() => void> = [];

afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    document.body.innerHTML = "";
});

describe("tabbables", () => {
    it("drops elements taken out of the tab order, hidden or aria-hidden", () => {
        const root = document.createElement("div");
        const negative = button("negative");
        negative.tabIndex = -1;
        const hidden = button("hidden");
        hidden.style.visibility = "hidden";
        const aria = button("aria");
        aria.setAttribute("aria-hidden", "true");
        root.append(button("kept"), negative, hidden, aria);
        document.body.append(root);
        expect(labels(tabbables(root))).toEqual(["kept"]);
    });
});

describe("tabSequence", () => {
    it("splices a portalled panel right after the last stop of its anchor", () => {
        const container = document.createElement("div");
        const anchor = document.createElement("span");
        anchor.append(button("trigger"));
        container.append(button("before"), anchor, button("after"));
        const panel = document.createElement("div");
        panel.append(button("p1"), button("p2"));
        document.body.append(container, panel);
        cleanups.push(registerPortalLayer({ anchor, panel }));

        expect(labels(tabSequence(container))).toEqual(["before", "trigger", "p1", "p2", "after"]);
    });

    it("places the panel of an anchor without stops after the stop that precedes it", () => {
        const container = document.createElement("div");
        const anchor = document.createElement("span");
        container.append(button("before"), anchor, button("after"));
        const panel = document.createElement("div");
        panel.append(button("p1"));
        document.body.append(container, panel);
        cleanups.push(registerPortalLayer({ anchor, panel }));

        expect(labels(tabSequence(container))).toEqual(["before", "p1", "after"]);
    });

    it("puts the panel first when nothing in the container precedes its anchor", () => {
        const container = document.createElement("div");
        const anchor = document.createElement("span");
        container.append(anchor, button("after"));
        const panel = document.createElement("div");
        panel.append(button("p1"));
        document.body.append(container, panel);
        cleanups.push(registerPortalLayer({ anchor, panel }));

        expect(labels(tabSequence(container))).toEqual(["p1", "after"]);
    });

    it("nests a panel opened from inside another panel", () => {
        const container = document.createElement("div");
        const anchor = document.createElement("span");
        anchor.append(button("trigger"));
        container.append(anchor, button("after"));
        const panel = document.createElement("div");
        const innerAnchor = document.createElement("span");
        innerAnchor.append(button("inner trigger"));
        panel.append(innerAnchor, button("p2"));
        const innerPanel = document.createElement("div");
        innerPanel.append(button("deep"));
        document.body.append(container, panel, innerPanel);
        cleanups.push(registerPortalLayer({ anchor, panel }));
        cleanups.push(registerPortalLayer({ anchor: innerAnchor, panel: innerPanel }));

        expect(labels(tabSequence(container))).toEqual([
            "trigger",
            "inner trigger",
            "deep",
            "p2",
            "after",
        ]);
        expect(tabRegion(container)).toEqual([container, panel, innerPanel]);
    });

    it("ignores panels opened from outside the container, and in-flow panels", () => {
        const container = document.createElement("div");
        const outsideAnchor = document.createElement("span");
        const inFlow = document.createElement("div");
        inFlow.append(button("in flow"));
        const anchor = document.createElement("span");
        container.append(anchor, inFlow);
        const panel = document.createElement("div");
        panel.append(button("foreign"));
        document.body.append(outsideAnchor, container, panel);
        cleanups.push(registerPortalLayer({ anchor: outsideAnchor, panel }));
        cleanups.push(registerPortalLayer({ anchor, panel: inFlow }));

        expect(labels(tabSequence(container))).toEqual(["in flow"]);
        expect(tabRegion(container)).toEqual([container]);
    });

    it("forgets a layer once it unregisters", () => {
        const container = document.createElement("div");
        const anchor = document.createElement("span");
        container.append(anchor);
        const panel = document.createElement("div");
        panel.append(button("p1"));
        document.body.append(container, panel);
        const unregister = registerPortalLayer({ anchor, panel });
        unregister();

        expect(tabSequence(container)).toEqual([]);
    });
});
