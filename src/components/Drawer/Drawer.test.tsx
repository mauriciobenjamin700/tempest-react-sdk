import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Drawer } from "./Drawer";

describe("Drawer", () => {
    it("does not render when closed", () => {
        const { container } = render(<Drawer open={false} onClose={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("closes on Esc and on close button click", async () => {
        const onClose = vi.fn();
        render(
            <Drawer open onClose={onClose} title="Side">
                body
            </Drawer>,
        );
        await userEvent.click(screen.getByLabelText("Fechar"));
        expect(onClose).toHaveBeenCalled();
    });
});

describe("Drawer — placement, handle and backdrop", () => {
    it.each(["left", "right", "top", "bottom"] as const)(
        "renders with placement=%s",
        (placement) => {
            render(
                <Drawer open onClose={vi.fn()} placement={placement} title="T">
                    body
                </Drawer>,
            );
            expect(screen.getByRole("dialog").className).toContain(placement);
        },
    );

    it("shows the drag handle only for top/bottom placements", () => {
        const { unmount } = render(
            <Drawer open onClose={vi.fn()} placement="bottom" showHandle>
                body
            </Drawer>,
        );
        expect(document.querySelector("[class*='handle']")).not.toBeNull();
        unmount();

        render(
            <Drawer open onClose={vi.fn()} placement="right" showHandle>
                body
            </Drawer>,
        );
        expect(document.querySelector("[class*='handle']")).toBeNull();
    });

    it("marks the handle for a top placement", () => {
        render(
            <Drawer open onClose={vi.fn()} placement="top" showHandle>
                body
            </Drawer>,
        );
        expect(document.querySelector("[class*='handleTop']")).not.toBeNull();
    });

    it("closes on a backdrop click, unless closeOnBackdrop is off", async () => {
        const onClose = vi.fn();
        const { unmount } = render(
            <Drawer open onClose={onClose}>
                body
            </Drawer>,
        );
        await userEvent.click(document.querySelector("[class*='overlay']") as HTMLElement);
        expect(onClose).toHaveBeenCalledTimes(1);
        unmount();

        const onCloseGuarded = vi.fn();
        render(
            <Drawer open onClose={onCloseGuarded} closeOnBackdrop={false}>
                body
            </Drawer>,
        );
        await userEvent.click(document.querySelector("[class*='overlay']") as HTMLElement);
        expect(onCloseGuarded).not.toHaveBeenCalled();
    });

    it("ignores Esc when closeOnEsc is off", () => {
        const onClose = vi.fn();
        render(
            <Drawer open onClose={onClose} closeOnEsc={false}>
                body
            </Drawer>,
        );
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onClose).not.toHaveBeenCalled();
    });

    it("restores body overflow when it closes", () => {
        const { unmount } = render(
            <Drawer open onClose={vi.fn()}>
                body
            </Drawer>,
        );
        expect(document.body.style.overflow).toBe("hidden");
        unmount();
        expect(document.body.style.overflow).not.toBe("hidden");
    });

    it("hides the close button when asked", () => {
        render(
            <Drawer open onClose={vi.fn()} title="T" hideCloseButton>
                body
            </Drawer>,
        );
        expect(screen.queryByRole("button", { name: /fechar/i })).not.toBeInTheDocument();
    });
});
