import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Menubar } from "./Menubar";
import type { MenubarMenu } from "./Menubar";

function buildMenus(onNew = vi.fn(), onUndo = vi.fn()): MenubarMenu[] {
    return [
        {
            label: "File",
            items: [
                { label: "New", shortcut: "⌘N", onSelect: onNew },
                { separator: true },
                { label: "Quit", onSelect: vi.fn() },
            ],
        },
        {
            label: "Edit",
            items: [{ label: "Undo", onSelect: onUndo }],
        },
    ];
}

describe("Menubar", () => {
    it("renders a menubar with menu triggers", () => {
        render(<Menubar menus={buildMenus()} />);
        expect(screen.getByRole("menubar")).toBeInTheDocument();
        expect(screen.getByText("File")).toBeInTheDocument();
        expect(screen.getByText("Edit")).toBeInTheDocument();
    });

    it("opens a menu's items on click", async () => {
        render(<Menubar menus={buildMenus()} />);
        await userEvent.click(screen.getByText("File"));
        expect(screen.getByRole("menu")).toBeInTheDocument();
        expect(screen.getByText("New")).toBeInTheDocument();
        expect(screen.getByText("⌘N")).toBeInTheDocument();
    });

    it("selecting an item calls onSelect and closes", async () => {
        const onNew = vi.fn();
        render(<Menubar menus={buildMenus(onNew)} />);
        await userEvent.click(screen.getByText("File"));
        await userEvent.click(screen.getByText("New"));
        expect(onNew).toHaveBeenCalled();
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("clicking another menu switches the open menu", async () => {
        render(<Menubar menus={buildMenus()} />);
        await userEvent.click(screen.getByText("File"));
        expect(screen.getByText("New")).toBeInTheDocument();
        await userEvent.click(screen.getByText("Edit"));
        expect(screen.queryByText("New")).not.toBeInTheDocument();
        expect(screen.getByText("Undo")).toBeInTheDocument();
    });

    it("arrow right moves to the next menu", async () => {
        render(<Menubar menus={buildMenus()} />);
        await userEvent.click(screen.getByText("File"));
        await userEvent.keyboard("{ArrowRight}");
        expect(screen.getByText("Undo")).toBeInTheDocument();
        expect(screen.queryByText("New")).not.toBeInTheDocument();
    });
});

describe("Menubar — keyboard wrap and dismissal", () => {
    it("Escape closes and returns focus to the trigger", async () => {
        render(<Menubar menus={buildMenus()} />);
        const file = screen.getByRole("menuitem", { name: "File" });
        await userEvent.click(file);
        expect(screen.getByText("New")).toBeInTheDocument();

        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByText("New")).not.toBeInTheDocument();
        expect(document.activeElement).toBe(file);
    });

    it("ArrowLeft wraps back to the last menu", async () => {
        render(<Menubar menus={buildMenus()} />);
        await userEvent.click(screen.getByRole("menuitem", { name: "File" }));

        fireEvent.keyDown(window, { key: "ArrowLeft" });
        expect(screen.getByText("Undo")).toBeInTheDocument();
    });

    it("ArrowRight wraps from the last menu to the first", async () => {
        render(<Menubar menus={buildMenus()} />);
        await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));

        fireEvent.keyDown(window, { key: "ArrowRight" });
        expect(screen.getByText("New")).toBeInTheDocument();
    });

    it("closes on an outside mousedown but not inside", async () => {
        render(<Menubar menus={buildMenus()} />);
        await userEvent.click(screen.getByRole("menuitem", { name: "File" }));

        fireEvent.mouseDown(screen.getByText("New"));
        expect(screen.getByText("New")).toBeInTheDocument();

        fireEvent.mouseDown(document.body);
        expect(screen.queryByText("New")).not.toBeInTheDocument();
    });

    it("ignores keys while every menu is closed", () => {
        render(<Menubar menus={buildMenus()} />);
        fireEvent.keyDown(window, { key: "ArrowRight" });
        expect(screen.queryByText("New")).not.toBeInTheDocument();
    });
});
