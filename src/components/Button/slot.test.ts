import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { composeRefs, mergeSlotProps } from "./slot";

describe("slot — composeRefs", () => {
    it("assigns the node to callback and object refs alike, and skips empty ones", () => {
        const callback = vi.fn();
        const object = createRef<HTMLElement>();
        const node = document.createElement("a");
        composeRefs<HTMLElement>(callback, object, null, undefined)(node);
        expect(callback).toHaveBeenCalledWith(node);
        expect(object.current).toBe(node);
    });
});

describe("slot — mergeSlotProps", () => {
    it("lets the slot's plain props win over the child's", () => {
        const merged = mergeSlotProps(
            { "aria-disabled": true },
            { "aria-disabled": false, id: "c" },
        );
        expect(merged["aria-disabled"]).toBe(true);
        expect(merged.id).toBe("c");
    });

    it("skips the child's handler when the slot's handler prevented the event", () => {
        const child = vi.fn();
        const merged = mergeSlotProps(
            { onClick: (event: { preventDefault: () => void }) => event.preventDefault() },
            { onClick: child },
        );
        const event = {
            defaultPrevented: false,
            preventDefault(): void {
                this.defaultPrevented = true;
            },
        };
        (merged.onClick as (event: unknown) => void)(event);
        expect(child).not.toHaveBeenCalled();
    });

    it("leaves the child's style untouched when the slot sets none", () => {
        const style = { margin: 1 };
        expect(mergeSlotProps({}, { style }).style).toBe(style);
    });
});
