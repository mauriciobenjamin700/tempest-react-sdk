import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VirtualList } from "./VirtualList";

let capturedCallback: (() => void) | null = null;
class ROMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(callback: () => void) {
        capturedCallback = callback;
    }
}

describe("VirtualList — resize", () => {
    it("re-renders when ResizeObserver fires", () => {
        Object.defineProperty(globalThis, "ResizeObserver", {
            writable: true,
            value: ROMock,
        });
        const items = Array.from({ length: 30 }, (_, i) => ({ id: i }));
        render(
            <VirtualList
                items={items}
                itemHeight={20}
                height={100}
                getKey={(row) => row.id}
                renderItem={(row) => <span data-testid={`row-${row.id}`}>{row.id}</span>}
            />,
        );
        act(() => {
            capturedCallback?.();
        });
        expect(screen.getByTestId("row-0")).toBeInTheDocument();
    });
});
