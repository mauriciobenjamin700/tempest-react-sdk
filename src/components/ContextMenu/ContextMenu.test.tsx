import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

describe("ContextMenu", () => {
    it("opens the menu at the cursor on right-click", () => {
        render(
            <ContextMenu items={[{ label: "Copy", onSelect: vi.fn() }]}>
                <div>target</div>
            </ContextMenu>,
        );
        fireEvent.contextMenu(screen.getByText("target"), { clientX: 120, clientY: 80 });
        const menu = screen.getByRole("menu");
        expect(menu).toBeInTheDocument();
        expect(menu).toHaveStyle({ left: "120px", top: "80px" });
    });

    it("invokes onSelect and closes when an item is clicked", async () => {
        const onSelect = vi.fn();
        render(
            <ContextMenu items={[{ label: "Copy", onSelect }]}>
                <div>target</div>
            </ContextMenu>,
        );
        fireEvent.contextMenu(screen.getByText("target"));
        await userEvent.click(screen.getByRole("menuitem"));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("closes on Escape", () => {
        render(
            <ContextMenu items={[{ label: "Copy", onSelect: vi.fn() }]}>
                <div>target</div>
            </ContextMenu>,
        );
        fireEvent.contextMenu(screen.getByText("target"));
        expect(screen.getByRole("menu")).toBeInTheDocument();
        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("renders separators and danger items", () => {
        render(
            <ContextMenu
                items={[
                    { label: "Edit", onSelect: vi.fn() },
                    { separator: true },
                    { label: "Delete", danger: true, onSelect: vi.fn() },
                ]}
            >
                <div>target</div>
            </ContextMenu>,
        );
        fireEvent.contextMenu(screen.getByText("target"));
        expect(screen.getAllByRole("menuitem")).toHaveLength(2);
        expect(document.querySelector("[role=separator]")).toBeInTheDocument();
        const danger = screen.getByText("Delete").closest("button");
        expect(danger?.className).toContain("danger");
    });

    it("moves focus with Arrow keys and selects with Enter", async () => {
        const first = vi.fn();
        const second = vi.fn();
        render(
            <ContextMenu
                items={[
                    { label: "First", onSelect: first },
                    { label: "Second", onSelect: second },
                ]}
            >
                <div>target</div>
            </ContextMenu>,
        );
        fireEvent.contextMenu(screen.getByText("target"));
        fireEvent.keyDown(window, { key: "ArrowDown" });
        fireEvent.keyDown(window, { key: "ArrowDown" });
        await userEvent.keyboard("{Enter}");
        expect(second).toHaveBeenCalledTimes(1);
        expect(first).not.toHaveBeenCalled();
    });
});

describe("ContextMenu — navigation wrap and dismissal", () => {
    const items = [
        { label: "Abrir", onSelect: vi.fn() },
        { separator: true as const },
        { label: "Renomear", onSelect: vi.fn() },
        { label: "Excluir", disabled: true, onSelect: vi.fn() },
    ];

    function openMenu() {
        const view = render(
            <ContextMenu items={items}>
                <div>alvo</div>
            </ContextMenu>,
        );
        fireEvent.contextMenu(screen.getByText("alvo"), { clientX: 10, clientY: 10 });
        return view;
    }

    it("wraps forwards past the last selectable item", () => {
        openMenu();
        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(document.activeElement?.textContent).toContain("Abrir");
        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(document.activeElement?.textContent).toContain("Renomear");
        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(document.activeElement?.textContent).toContain("Abrir");
    });

    it("wraps backwards with ArrowUp", () => {
        openMenu();
        fireEvent.keyDown(window, { key: "ArrowUp" });
        expect(document.activeElement?.textContent).toContain("Abrir");
        fireEvent.keyDown(window, { key: "ArrowUp" });
        expect(document.activeElement?.textContent).toContain("Renomear");
    });

    it("closes on an outside mousedown and stays open inside", () => {
        openMenu();
        fireEvent.mouseDown(screen.getByRole("menu"));
        expect(screen.getByRole("menu")).toBeInTheDocument();

        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("ignores keys while closed and unrelated keys while open", () => {
        render(
            <ContextMenu items={items}>
                <div>alvo</div>
            </ContextMenu>,
        );
        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();

        fireEvent.contextMenu(screen.getByText("alvo"), { clientX: 5, clientY: 5 });
        fireEvent.keyDown(window, { key: "b" });
        expect(screen.getByRole("menu")).toBeInTheDocument();
    });
});
