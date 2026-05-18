import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";

describe("BottomSheet", () => {
    it("renders nothing when open=false", () => {
        render(
            <BottomSheet open={false} onClose={() => {}}>
                content
            </BottomSheet>,
        );
        expect(screen.queryByText("content")).toBeNull();
    });

    it("renders title and body when open", () => {
        render(
            <BottomSheet open onClose={() => {}} title="Filters">
                content
            </BottomSheet>,
        );
        expect(screen.getByText("Filters")).toBeInTheDocument();
        expect(screen.getByText("content")).toBeInTheDocument();
    });

    it("closes on backdrop click", async () => {
        const onClose = vi.fn();
        const { container } = render(
            <BottomSheet open onClose={onClose}>
                content
            </BottomSheet>,
        );
        const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
        await userEvent.click(backdrop);
        expect(onClose).toHaveBeenCalled();
        // Use container in an assertion to avoid unused-var lint.
        expect(container).toBeDefined();
    });

    it("closes on Escape key", () => {
        const onClose = vi.fn();
        render(
            <BottomSheet open onClose={onClose}>
                content
            </BottomSheet>,
        );
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(onClose).toHaveBeenCalled();
    });

    it("closes when the handle is clicked", async () => {
        const onClose = vi.fn();
        render(
            <BottomSheet open onClose={onClose}>
                content
            </BottomSheet>,
        );
        await userEvent.click(screen.getByLabelText("Arrastar para fechar"));
        expect(onClose).toHaveBeenCalled();
    });
});
