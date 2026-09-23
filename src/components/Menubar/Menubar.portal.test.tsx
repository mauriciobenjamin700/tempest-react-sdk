import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Menubar } from "./Menubar";

describe("Menubar in a portal", () => {
    it("renders the panel outside the menubar, so an overflow ancestor cannot clip it", async () => {
        render(
            <div style={{ overflowX: "auto" }} data-testid="clip">
                <Menubar menus={[{ label: "Arquivo", items: [{ label: "Novo" }] }]} />
            </div>,
        );
        await userEvent.click(screen.getByText("Arquivo"));
        const panel = screen.getByRole("menu");
        expect(screen.getByTestId("clip").contains(panel)).toBe(false);
        expect(panel.style.position).toBe("fixed");
    });

    it("keeps the panel in flow when portal is false", async () => {
        const { container } = render(
            <Menubar portal={false} menus={[{ label: "Arquivo", items: [{ label: "Novo" }] }]} />,
        );
        await userEvent.click(screen.getByText("Arquivo"));
        expect(container.contains(screen.getByRole("menu"))).toBe(true);
    });

    it("runs an item of the portalled panel: its press is not an outside press", async () => {
        const onSelect = vi.fn();
        render(<Menubar menus={[{ label: "Arquivo", items: [{ label: "Novo", onSelect }] }]} />);
        await userEvent.click(screen.getByText("Arquivo"));
        await userEvent.click(screen.getByRole("menuitem", { name: "Novo" }));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("puts the panel's items right after their trigger in the tab order", async () => {
        render(
            <Menubar
                menus={[{ label: "Arquivo", items: [{ label: "Novo" }, { label: "Abrir" }] }]}
            />,
        );
        await userEvent.click(screen.getByText("Arquivo"));
        await userEvent.tab();
        expect(screen.getByRole("menuitem", { name: "Novo" })).toHaveFocus();
    });
});
