import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Drawer, type DrawerPlacement } from "./Drawer";

describe("Drawer — placements + behaviors", () => {
    it.each<DrawerPlacement>(["right", "left", "top", "bottom"])(
        "renders with placement=%s",
        (placement) => {
            render(
                <Drawer open onClose={vi.fn()} placement={placement} hideCloseButton>
                    content
                </Drawer>,
            );
            expect(screen.getByRole("dialog")).toBeInTheDocument();
        },
    );

    it("closes on backdrop click", () => {
        const onClose = vi.fn();
        const { baseElement } = render(
            <Drawer open onClose={onClose} hideCloseButton>
                content
            </Drawer>,
        );
        const overlay = baseElement.querySelector("[class*=overlay]") as HTMLElement;
        fireEvent.click(overlay);
        expect(onClose).toHaveBeenCalled();
    });

    it("does not close on backdrop when closeOnBackdrop=false", () => {
        const onClose = vi.fn();
        const { baseElement } = render(
            <Drawer open onClose={onClose} closeOnBackdrop={false} hideCloseButton>
                content
            </Drawer>,
        );
        const overlay = baseElement.querySelector("[class*=overlay]") as HTMLElement;
        fireEvent.click(overlay);
        expect(onClose).not.toHaveBeenCalled();
    });

    it("renders footer slot when provided", () => {
        render(
            <Drawer open onClose={vi.fn()} title="t" footer={<span>foot</span>}>
                body
            </Drawer>,
        );
        expect(screen.getByText("foot")).toBeInTheDocument();
    });
});
