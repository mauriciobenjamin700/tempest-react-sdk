import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Modal } from "./Modal";

/**
 * A page with stops before and after the trigger, so a focus that escaped the
 * Modal would land on one of them.
 *
 * @returns The page.
 */
function Page() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button>before</button>
            <button onClick={() => setOpen(true)}>opener</button>
            <button>after</button>
            <Modal open={open} onClose={() => setOpen(false)} title="Filtros">
                <button>apply</button>
            </Modal>
        </>
    );
}

/**
 * The name of the focused element.
 *
 * @returns Its accessible label or text.
 */
function focused(): string {
    const el = document.activeElement as HTMLElement;
    return el.getAttribute("aria-label") ?? el.textContent ?? el.tagName;
}

describe("Modal focus trap", () => {
    it("moves focus into the dialog when it opens", async () => {
        const user = userEvent.setup();
        render(<Page />);
        await user.click(screen.getByText("opener"));
        expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    });

    it("keeps Tab and Shift+Tab inside the dialog", async () => {
        const user = userEvent.setup();
        render(<Page />);
        await user.click(screen.getByText("opener"));
        const dialog = screen.getByRole("dialog");
        for (let step = 0; step < 4; step += 1) {
            await user.tab();
            expect(dialog.contains(document.activeElement), focused()).toBe(true);
        }
        for (let step = 0; step < 4; step += 1) {
            await user.tab({ shift: true });
            expect(dialog.contains(document.activeElement), focused()).toBe(true);
        }
    });

    it("returns focus to the opener when it closes", async () => {
        const user = userEvent.setup();
        render(<Page />);
        await user.click(screen.getByText("opener"));
        await user.keyboard("{Escape}");
        expect(focused()).toBe("opener");
    });
});
