import { fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { useFocusTrap } from "./use-focus-trap";

function TrapContainer() {
    const ref = useRef<HTMLDivElement>(null);
    useFocusTrap(ref, true);
    return (
        <div ref={ref}>
            <button data-testid="first">first</button>
            <button data-testid="middle">middle</button>
            <button data-testid="last">last</button>
        </div>
    );
}

describe("useFocusTrap", () => {
    it("wraps Tab from last back to first", () => {
        const { getByTestId } = render(<TrapContainer />);
        const last = getByTestId("last");
        last.focus();
        expect(document.activeElement).toBe(last);
        fireEvent.keyDown(document, { key: "Tab" });
        expect(document.activeElement).toBe(getByTestId("first"));
    });

    it("wraps Shift+Tab from first to last", () => {
        const { getByTestId } = render(<TrapContainer />);
        const first = getByTestId("first");
        first.focus();
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(getByTestId("last"));
    });
});
