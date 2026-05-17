import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal — backdrop + close button", () => {
    it("closes on close button click", async () => {
        const onClose = vi.fn();
        render(
            <Modal open onClose={onClose} title="t">
                body
            </Modal>,
        );
        fireEvent.click(screen.getByLabelText("Fechar"));
        expect(onClose).toHaveBeenCalled();
    });

    it("closes on backdrop click", () => {
        const onClose = vi.fn();
        const { baseElement } = render(
            <Modal open onClose={onClose} hideCloseButton>
                body
            </Modal>,
        );
        const overlay = baseElement.querySelector("[class*=overlay]") as HTMLElement;
        fireEvent.click(overlay);
        expect(onClose).toHaveBeenCalled();
    });

    it("does not close on inner content click", () => {
        const onClose = vi.fn();
        render(
            <Modal open onClose={onClose}>
                <span>body</span>
            </Modal>,
        );
        fireEvent.click(screen.getByText("body"));
        expect(onClose).not.toHaveBeenCalled();
    });

    it("renders all sizes", () => {
        for (const size of ["sm", "md", "lg", "xl"] as const) {
            const { unmount } = render(
                <Modal open onClose={vi.fn()} size={size}>
                    x
                </Modal>,
            );
            expect(screen.getByRole("dialog")).toBeInTheDocument();
            unmount();
        }
    });
});
