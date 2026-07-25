import { fireEvent, render, screen } from "@testing-library/react";
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

describe("NavigationMenu — hover exit, outside click and link items", () => {
    const twoParents: NavigationMenuItem[] = [
        { label: "Products", children: [{ label: "Analytics", href: "/analytics" }] },
        { label: "Company", children: [{ label: "About", href: "/about" }] },
    ];

    it("closes a hovered submenu when the pointer leaves", async () => {
        render(<NavigationMenu items={items} />);
        const row = screen.getByRole("button", { name: "Products" }).parentElement as HTMLElement;

        fireEvent.mouseEnter(row);
        expect(await screen.findByText("Analytics")).toBeInTheDocument();

        fireEvent.mouseLeave(row);
        expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
    });

    it("keeps the panel open when the pointer leaves a different row", async () => {
        render(<NavigationMenu items={twoParents} />);
        const products = screen.getByRole("button", { name: "Products" })
            .parentElement as HTMLElement;
        const company = screen.getByRole("button", { name: "Company" })
            .parentElement as HTMLElement;

        fireEvent.mouseEnter(products);
        expect(await screen.findByText("Analytics")).toBeInTheDocument();

        fireEvent.mouseLeave(company);
        expect(screen.getByText("Analytics")).toBeInTheDocument();
    });

    it("toggles a clicked submenu shut on a second click", () => {
        render(<NavigationMenu items={items} />);
        const trigger = screen.getByRole("button", { name: "Products" });

        fireEvent.click(trigger);
        expect(screen.getByText("Analytics")).toBeInTheDocument();
        fireEvent.click(trigger);
        expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
    });

    it("opens on focus and closes on an outside mousedown", async () => {
        render(<NavigationMenu items={items} />);
        const trigger = screen.getByRole("button", { name: "Products" });

        fireEvent.focus(trigger);
        expect(await screen.findByText("Analytics")).toBeInTheDocument();

        fireEvent.mouseDown(document.body);
        expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
    });

    it("renders a child with href as an anchor carrying the menuitem role", () => {
        render(<NavigationMenu items={items} />);
        fireEvent.click(screen.getByRole("button", { name: "Products" }));

        const link = screen.getByRole("menuitem", { name: "Analytics" });
        expect(link.tagName).toBe("A");
        expect(link).toHaveAttribute("href", "/analytics");
    });

    it("renders a child without href as a button", () => {
        render(<NavigationMenu items={items} />);
        fireEvent.click(screen.getByRole("button", { name: "Products" }));

        const action = screen.getByRole("menuitem", { name: "Billing" });
        expect(action.tagName).toBe("BUTTON");
    });
});
