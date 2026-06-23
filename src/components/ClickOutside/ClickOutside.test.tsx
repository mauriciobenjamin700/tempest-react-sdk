import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClickOutside } from "./ClickOutside";

describe("ClickOutside", () => {
    it("does not call onOutside when clicking inside", () => {
        const onOutside = vi.fn();
        render(
            <ClickOutside onOutside={onOutside}>
                <button>inside</button>
            </ClickOutside>,
        );
        fireEvent.mouseDown(screen.getByText("inside"));
        expect(onOutside).not.toHaveBeenCalled();
    });

    it("calls onOutside when clicking outside (document.body)", () => {
        const onOutside = vi.fn();
        render(
            <ClickOutside onOutside={onOutside}>
                <button>inside</button>
            </ClickOutside>,
        );
        fireEvent.mouseDown(document.body);
        expect(onOutside).toHaveBeenCalledTimes(1);
    });

    it("calls onOutside on touchstart outside", () => {
        const onOutside = vi.fn();
        render(
            <ClickOutside onOutside={onOutside}>
                <span>inside</span>
            </ClickOutside>,
        );
        fireEvent.touchStart(document.body);
        expect(onOutside).toHaveBeenCalledTimes(1);
    });

    it("forwards div attributes", () => {
        const onOutside = vi.fn();
        const { container } = render(
            <ClickOutside onOutside={onOutside} data-testid="wrapper" className="x">
                <span>inside</span>
            </ClickOutside>,
        );
        const div = container.querySelector("div");
        expect(div?.getAttribute("data-testid")).toBe("wrapper");
        expect(div?.className).toBe("x");
    });

    it("removes listeners on unmount", () => {
        const onOutside = vi.fn();
        const { unmount } = render(
            <ClickOutside onOutside={onOutside}>
                <span>inside</span>
            </ClickOutside>,
        );
        unmount();
        fireEvent.mouseDown(document.body);
        expect(onOutside).not.toHaveBeenCalled();
    });
});
