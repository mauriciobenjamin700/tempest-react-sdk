import { act, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useClickOutside } from "./use-click-outside";

function Harness({ onOutside }: { onOutside: () => void }): React.ReactElement {
    const ref = useClickOutside<HTMLDivElement>(onOutside);
    return (
        <div>
            <div ref={ref} data-testid="inside">
                inside
            </div>
            <button data-testid="outside">outside</button>
        </div>
    );
}

describe("useClickOutside", () => {
    it("fires on mousedown outside the ref", () => {
        const handler = vi.fn();
        const { getByTestId } = render(<Harness onOutside={handler} />);
        act(() => {
            getByTestId("outside").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("does not fire when clicking inside the ref", () => {
        const handler = vi.fn();
        const { getByTestId } = render(<Harness onOutside={handler} />);
        act(() => {
            getByTestId("inside").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        });
        expect(handler).not.toHaveBeenCalled();
    });

    it("fires on touchstart outside the ref", () => {
        const handler = vi.fn();
        const { getByTestId } = render(<Harness onOutside={handler} />);
        act(() => {
            getByTestId("outside").dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
        });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("returns a usable ref object", () => {
        const { result } = renderHook(() => useClickOutside(() => {}));
        expect(result.current).toHaveProperty("current");
    });
});
