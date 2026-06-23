import { render, screen } from "@testing-library/react";
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
