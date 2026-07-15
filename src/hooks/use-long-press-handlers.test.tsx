import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLongPressHandlers } from "./use-long-press-handlers";

describe("useLongPressHandlers", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("fires onLongPress after the delay when held", () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useLongPressHandlers(fn, { delayMs: 500 }));
        act(() => {
            result.current.onMouseDown({} as React.MouseEvent);
            vi.advanceTimersByTime(600);
        });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(result.current.wasLongPress()).toBe(true);
    });

    it("does not fire when released before the delay", () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useLongPressHandlers(fn, { delayMs: 500 }));
        act(() => {
            result.current.onMouseDown({} as React.MouseEvent);
            vi.advanceTimersByTime(200);
            result.current.onMouseUp();
            vi.advanceTimersByTime(500);
        });
        expect(fn).not.toHaveBeenCalled();
        expect(result.current.wasLongPress()).toBe(false);
    });

    it("wasLongPress guards the click that follows a hold", () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useLongPressHandlers(fn, { delayMs: 400 }));
        act(() => {
            result.current.onTouchStart({} as React.TouchEvent);
            vi.advanceTimersByTime(500);
        });
        expect(result.current.wasLongPress()).toBe(true);

        act(() => {
            result.current.onTouchStart({} as React.TouchEvent);
            vi.advanceTimersByTime(100);
            result.current.onTouchEnd();
        });
        expect(result.current.wasLongPress()).toBe(false);
    });

    it("fires immediately on contextmenu and prevents default", () => {
        const fn = vi.fn();
        const preventDefault = vi.fn();
        const { result } = renderHook(() => useLongPressHandlers(fn));
        act(() => {
            result.current.onContextMenu({ preventDefault } as unknown as React.MouseEvent);
        });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(preventDefault).toHaveBeenCalled();
        expect(result.current.wasLongPress()).toBe(true);
    });

    it("is inert when disabled", () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useLongPressHandlers(fn, { disabled: true }));
        act(() => {
            result.current.onMouseDown({} as React.MouseEvent);
            vi.advanceTimersByTime(1000);
        });
        expect(fn).not.toHaveBeenCalled();
    });
});
