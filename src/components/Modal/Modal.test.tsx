import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
    it("returns nothing when closed", () => {
        const { container } = render(
            <Modal open={false} onClose={vi.fn()}>
                hidden
            </Modal>,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it("renders when open + closes on Esc", async () => {
        const onClose = vi.fn();
        render(
            <Modal open onClose={onClose} title="Title">
                body
            </Modal>,
        );
        expect(screen.getByText("body")).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalled();
    });
});
