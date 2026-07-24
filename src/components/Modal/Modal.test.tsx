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

    it("names the dialog from its title via aria-labelledby", () => {
        render(
            <Modal open onClose={vi.fn()} title="Confirmar">
                body
            </Modal>,
        );
        const dialog = screen.getByRole("dialog");
        const labelledBy = dialog.getAttribute("aria-labelledby");
        expect(labelledBy).toBeTruthy();
        expect(document.getElementById(labelledBy!)).toHaveTextContent("Confirmar");
    });

    it("falls back to aria-label and renders no empty heading without a title", () => {
        render(
            <Modal open onClose={vi.fn()} aria-label="Pré-visualização">
                body
            </Modal>,
        );
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute("aria-label", "Pré-visualização");
        expect(dialog).not.toHaveAttribute("aria-labelledby");
        expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    });
});
