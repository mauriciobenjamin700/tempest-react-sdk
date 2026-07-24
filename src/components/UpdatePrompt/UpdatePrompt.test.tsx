import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UpdatePrompt } from "./UpdatePrompt";

describe("UpdatePrompt", () => {
    it("renders nothing when closed", () => {
        const { container } = render(<UpdatePrompt open={false} onUpdate={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("shows the message and action when open", () => {
        render(<UpdatePrompt open onUpdate={vi.fn()} message="Nova versão" />);
        expect(screen.getByText("Nova versão")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Atualizar" })).toBeInTheDocument();
    });

    it("fires onUpdate when the action is clicked", async () => {
        const onUpdate = vi.fn();
        render(<UpdatePrompt open onUpdate={onUpdate} actionLabel="Recarregar" />);
        await userEvent.click(screen.getByRole("button", { name: "Recarregar" }));
        expect(onUpdate).toHaveBeenCalled();
    });

    it("shows dismiss only when onDismiss is provided", async () => {
        const onDismiss = vi.fn();
        const { rerender } = render(<UpdatePrompt open onUpdate={vi.fn()} />);
        expect(screen.queryByLabelText("Dispensar")).not.toBeInTheDocument();
        rerender(<UpdatePrompt open onUpdate={vi.fn()} onDismiss={onDismiss} />);
        await userEvent.click(screen.getByLabelText("Dispensar"));
        expect(onDismiss).toHaveBeenCalled();
    });
});
