import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavigationMenu } from "./NavigationMenu";
import type { NavigationMenuItem } from "./NavigationMenu";

const items: NavigationMenuItem[] = [
    { label: "Home", href: "/" },
    {
        label: "Products",
        children: [
            { label: "Analytics", href: "/analytics" },
            { label: "Billing", onSelect: vi.fn() },
        ],
    },
];

describe("NavigationMenu", () => {
    it("renders top-level items", () => {
        render(<NavigationMenu items={items} />);
        expect(screen.getByText("Home")).toBeInTheDocument();
        expect(screen.getByText("Products")).toBeInTheDocument();
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("opens a submenu on click and shows children", async () => {
        render(<NavigationMenu items={items} />);
        await userEvent.click(screen.getByText("Products"));
        expect(screen.getByRole("menu")).toBeInTheDocument();
        expect(screen.getByText("Analytics")).toBeInTheDocument();
        expect(screen.getByText("Billing")).toBeInTheDocument();
    });

    it("opens a submenu on hover", async () => {
        render(<NavigationMenu items={items} />);
        await userEvent.hover(screen.getByText("Products"));
        expect(screen.getByRole("menu")).toBeInTheDocument();
        expect(screen.getByText("Analytics")).toBeInTheDocument();
    });

    it("closes on Escape", async () => {
        render(<NavigationMenu items={items} />);
        await userEvent.click(screen.getByText("Products"));
        expect(screen.getByRole("menu")).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("invokes onSelect and closes when selecting a child", async () => {
        const onSelect = vi.fn();
        render(
            <NavigationMenu items={[{ label: "Menu", children: [{ label: "Go", onSelect }] }]} />,
        );
        await userEvent.click(screen.getByText("Menu"));
        await userEvent.click(screen.getByRole("menuitem"));
        expect(onSelect).toHaveBeenCalled();
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
});
