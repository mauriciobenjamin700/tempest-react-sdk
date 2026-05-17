import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
    it("fires onConfirm and onCancel", async () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        render(
            <ConfirmDialog
                open
                title="Delete?"
                description="Forever"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
        expect(onConfirm).toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
        expect(onCancel).toHaveBeenCalled();
    });
});
