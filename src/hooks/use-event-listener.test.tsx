import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEventListener } from "./use-event-listener";

describe("useEventListener", () => {
    it("subscribes to window events by default", () => {
        const handler = vi.fn();
        renderHook(() => useEventListener("resize", handler));
        act(() => {
            window.dispatchEvent(new Event("resize"));
        });
        expect(handler).toHaveBeenCalled();
    });

    it("uses latest handler without resubscribing", () => {
        const log: string[] = [];
        const Comp = ({ tag }: { tag: string }) => {
            useEventListener("custom-event" as keyof WindowEventMap, () => log.push(tag));
        };
        const { rerender } = renderHook(({ tag }) => Comp({ tag }), {
            initialProps: { tag: "a" },
        });
        rerender({ tag: "b" });
        act(() => {
            window.dispatchEvent(new Event("custom-event"));
        });
        expect(log).toEqual(["b"]);
    });

    it("accepts a ref target", () => {
        const handler = vi.fn();
        const el = document.createElement("div");
        document.body.appendChild(el);
        const ref = { current: el };
        renderHook(() => useEventListener("click", handler, ref));
        act(() => {
            el.dispatchEvent(new Event("click"));
        });
        expect(handler).toHaveBeenCalled();
        document.body.removeChild(el);
    });

    it("unsubscribes on unmount", () => {
        const handler = vi.fn();
        const { unmount } = renderHook(() => useEventListener("resize", handler));
        unmount();
        act(() => {
            window.dispatchEvent(new Event("resize"));
        });
        expect(handler).not.toHaveBeenCalled();
    });
});
