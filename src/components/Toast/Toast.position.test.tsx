import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "./ToastProvider";

function ShowFromHook() {
    const toast = useToast();
    return (
        <button onClick={() => toast.show({ description: "hi" })} type="button">
            go
        </button>
    );
}

describe("Toast — position", () => {
    const positions = [
        "top-right",
        "top-left",
        "top-center",
        "bottom-right",
        "bottom-left",
        "bottom-center",
    ] as const;

    it.each(positions)("applies position=%s", (position) => {
        const { container, getByRole } = render(
            <ToastProvider position={position}>
                <ShowFromHook />
            </ToastProvider>,
        );
        act(() => {
            getByRole("button").click();
        });
        const portalRoot = container.ownerDocument.body;
        const containerEl = portalRoot.querySelector("[aria-live]");
        expect(containerEl?.className).toContain("position");
    });
});
