import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavigationMenu } from "./NavigationMenu";

describe("NavigationMenu in a portal", () => {
    it("renders the panel outside the menu, so an overflow ancestor cannot clip it", async () => {
        render(
            <div style={{ overflowX: "auto" }} data-testid="clip">
                <NavigationMenu
                    items={[{ label: "Produtos", children: [{ label: "A", href: "#a" }] }]}
                />
            </div>,
        );
        await userEvent.click(screen.getByText("Produtos"));
        const panel = screen.getByRole("menu");
        expect(screen.getByTestId("clip").contains(panel)).toBe(false);
        expect(panel.style.position).toBe("fixed");
    });

    it("keeps the panel in flow when portal is false", async () => {
        const { container } = render(
            <NavigationMenu
                portal={false}
                items={[{ label: "Produtos", children: [{ label: "A", href: "#a" }] }]}
            />,
        );
        await userEvent.click(screen.getByText("Produtos"));
        expect(container.contains(screen.getByRole("menu"))).toBe(true);
    });

    it("activates an entry of the portalled panel: its press is not an outside press", async () => {
        const onSelect = vi.fn();
        render(
            <NavigationMenu
                items={[{ label: "Produtos", children: [{ label: "A", onSelect }] }]}
            />,
        );
        await userEvent.click(screen.getByText("Produtos"));
        await userEvent.click(screen.getByRole("menuitem", { name: "A" }));
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it("puts the panel's entries right after their trigger in the tab order", async () => {
        render(
            <>
                <NavigationMenu
                    items={[
                        {
                            label: "Produtos",
                            children: [
                                { label: "A", href: "#a" },
                                { label: "B", href: "#b" },
                            ],
                        },
                    ]}
                />
                <button type="button">after</button>
            </>,
        );
        await userEvent.click(screen.getByText("Produtos"));
        await userEvent.tab();
        expect(screen.getByText("A")).toHaveFocus();
        await userEvent.tab();
        await userEvent.tab();
        expect(screen.getByText("after")).toHaveFocus();
    });
});
