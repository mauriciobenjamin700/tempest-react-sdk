import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RefreshIndicator } from "./RefreshIndicator";

function stubScrollTop(element: HTMLElement, value: number): void {
    Object.defineProperty(element, "scrollTop", { value, configurable: true });
}

function getWrapper(): HTMLElement {
    return screen.getByText("Content").parentElement!.parentElement!;
}

describe("RefreshIndicator", () => {
    it("renders children", () => {
        render(
            <RefreshIndicator onRefresh={vi.fn()}>
                <div>Content</div>
            </RefreshIndicator>,
        );
        expect(screen.getByText("Content")).toBeInTheDocument();
    });

    it("calls onRefresh after a pull past the threshold", async () => {
        const onRefresh = vi.fn().mockResolvedValue(undefined);
        render(
            <RefreshIndicator onRefresh={onRefresh} threshold={80}>
                <div>Content</div>
            </RefreshIndicator>,
        );
        const wrapper = getWrapper();
        stubScrollTop(wrapper, 0);

        fireEvent.touchStart(wrapper, { touches: [{ clientY: 0 }] });
        // pull distance 400 -> resistance 200, capped at 120, well past 80
        fireEvent.touchMove(wrapper, { touches: [{ clientY: 400 }] });
        fireEvent.touchEnd(wrapper, { changedTouches: [{ clientY: 400 }] });

        await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    });

    it("does not call onRefresh for a small pull below the threshold", async () => {
        const onRefresh = vi.fn().mockResolvedValue(undefined);
        render(
            <RefreshIndicator onRefresh={onRefresh} threshold={80}>
                <div>Content</div>
            </RefreshIndicator>,
        );
        const wrapper = getWrapper();
        stubScrollTop(wrapper, 0);

        fireEvent.touchStart(wrapper, { touches: [{ clientY: 0 }] });
        // delta 40 -> resistance 20, below 80
        fireEvent.touchMove(wrapper, { touches: [{ clientY: 40 }] });
        fireEvent.touchEnd(wrapper, { changedTouches: [{ clientY: 40 }] });

        await Promise.resolve();
        expect(onRefresh).not.toHaveBeenCalled();
    });

    it("does nothing when disabled", async () => {
        const onRefresh = vi.fn().mockResolvedValue(undefined);
        render(
            <RefreshIndicator onRefresh={onRefresh} threshold={80} disabled>
                <div>Content</div>
            </RefreshIndicator>,
        );
        const wrapper = getWrapper();
        stubScrollTop(wrapper, 0);

        fireEvent.touchStart(wrapper, { touches: [{ clientY: 0 }] });
        fireEvent.touchMove(wrapper, { touches: [{ clientY: 400 }] });
        fireEvent.touchEnd(wrapper, { changedTouches: [{ clientY: 400 }] });

        await Promise.resolve();
        expect(onRefresh).not.toHaveBeenCalled();
    });
});
