import type { ReactNode } from "react";
import { fireEvent, render, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { useFocusTrap } from "./use-focus-trap";

/**
 * Render a trapped container with the given children.
 *
 * The hook reads `document.activeElement` and listens on document-level
 * `keydown`, so the tree has to be really attached — `render` from
 * testing-library mounts into `document.body`, which is enough.
 *
 * @param children - Content placed inside the trapped container.
 * @param active - Whether the trap is armed. Defaults to `true`.
 */
function Trapped({ children, active = true }: { children: ReactNode; active?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    useFocusTrap(ref, active);
    return <div ref={ref}>{children}</div>;
}

describe("useFocusTrap", () => {
    it("does nothing when inactive", () => {
        const { result } = renderHook(() => {
            const ref = useRef<HTMLDivElement>(null);
            useFocusTrap(ref, false);
            return ref;
        });
        expect(result.current).toBeDefined();
    });

    it("focuses the first focusable child on activation", () => {
        render(
            <Trapped>
                <button>first</button>
                <button>last</button>
            </Trapped>,
        );
        expect(document.activeElement?.textContent).toBe("first");
    });

    it("wraps Tab from the last element back to the first", () => {
        render(
            <Trapped>
                <button>first</button>
                <button>last</button>
            </Trapped>,
        );
        const last = document.querySelectorAll("button")[1] as HTMLButtonElement;
        last.focus();
        fireEvent.keyDown(document, { key: "Tab" });
        expect(document.activeElement?.textContent).toBe("first");
    });

    it("leaves Tab alone in the middle of the list", () => {
        render(
            <Trapped>
                <button>first</button>
                <button>middle</button>
                <button>last</button>
            </Trapped>,
        );
        const middle = document.querySelectorAll("button")[1] as HTMLButtonElement;
        middle.focus();
        fireEvent.keyDown(document, { key: "Tab" });
        expect(document.activeElement?.textContent).toBe("middle");
    });

    it("wraps Shift+Tab from the first element to the last", () => {
        render(
            <Trapped>
                <button>first</button>
                <button>last</button>
            </Trapped>,
        );
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(document.activeElement?.textContent).toBe("last");
    });

    it("pulls focus back to the last element on Shift+Tab from outside", () => {
        render(
            <>
                <button>outside</button>
                <Trapped>
                    <button>first</button>
                    <button>last</button>
                </Trapped>
            </>,
        );
        const outside = document.querySelectorAll("button")[0] as HTMLButtonElement;
        outside.focus();
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(document.activeElement?.textContent).toBe("last");
    });

    it("swallows Tab when there is nothing focusable inside", () => {
        render(
            <Trapped>
                <span>text only</span>
            </Trapped>,
        );
        const event = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
        document.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    });

    it("ignores keys other than Tab", () => {
        render(
            <Trapped>
                <button>first</button>
                <button>last</button>
            </Trapped>,
        );
        const last = document.querySelectorAll("button")[1] as HTMLButtonElement;
        last.focus();
        fireEvent.keyDown(document, { key: "Enter" });
        expect(document.activeElement?.textContent).toBe("last");
    });

    it("skips aria-hidden and display:none candidates", () => {
        render(
            <Trapped>
                <button aria-hidden="true">hidden by aria</button>
                <button style={{ display: "none" }}>hidden by css</button>
                <button>real</button>
            </Trapped>,
        );
        expect(document.activeElement?.textContent).toBe("real");
    });

    it("restores the previously focused element when the trap releases", () => {
        render(<button>opener</button>);
        const opener = document.querySelector("button") as HTMLButtonElement;
        opener.focus();

        const { unmount } = render(
            <Trapped>
                <button>inside</button>
            </Trapped>,
        );
        expect(document.activeElement?.textContent).toBe("inside");
        unmount();
        expect(document.activeElement?.textContent).toBe("opener");
    });

    it("does nothing when the container ref is empty", () => {
        const { result } = renderHook(() => {
            const ref = useRef<HTMLDivElement>(null);
            useFocusTrap(ref, true);
            return ref;
        });
        expect(result.current.current).toBeNull();
    });
});
