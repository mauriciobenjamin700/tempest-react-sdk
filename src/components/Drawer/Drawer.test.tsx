import { render, screen } from "@testing-library/react";
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
