import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DropdownMenu } from "./DropdownMenu";

describe("DropdownMenu", () => {
    it("opens on trigger click", async () => {
        render(
            <DropdownMenu
                trigger={<button type="button">menu</button>}
                items={[{ type: "item", id: "a", label: "Item A", onSelect: vi.fn() }]}
            />,
        );
        await userEvent.click(screen.getByText("menu"));
        expect(screen.getByText("Item A")).toBeInTheDocument();
    });

    it("invokes onSelect and closes", async () => {
        const onSelect = vi.fn();
        render(
            <DropdownMenu
                trigger={<button type="button">menu</button>}
                items={[{ type: "item", id: "a", label: "A", onSelect }]}
            />,
        );
        await userEvent.click(screen.getByText("menu"));
        await userEvent.click(screen.getByRole("menuitem"));
        expect(onSelect).toHaveBeenCalled();
        expect(screen.queryByText("A")).not.toBeInTheDocument();
    });

    it("renders separator + label entries", async () => {
        render(
            <DropdownMenu
                trigger={<button type="button">menu</button>}
                items={[
                    { type: "label", id: "l", label: "Group" },
                    { type: "item", id: "a", label: "A", onSelect: vi.fn() },
                    { type: "separator", id: "s" },
                    { type: "item", id: "b", label: "B", onSelect: vi.fn() },
                ]}
            />,
        );
        await userEvent.click(screen.getByText("menu"));
        expect(screen.getByText("Group")).toBeInTheDocument();
        expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    });

    it("danger entry gets danger class", async () => {
        const { container } = render(
            <DropdownMenu
                trigger={<button type="button">menu</button>}
                items={[
                    { type: "item", id: "a", label: "Delete", danger: true, onSelect: vi.fn() },
                ]}
            />,
        );
        await userEvent.click(screen.getByText("menu"));
        const item = container.querySelector("[role=menuitem]");
        expect(item?.className).toContain("danger");
    });
});

describe("DropdownMenu — placement, keyboard and entry kinds", () => {
    const items = [
        { type: "label" as const, id: "l", label: "Ações" },
        { type: "item" as const, id: "a", label: "Editar", onSelect: vi.fn() },
        { type: "separator" as const, id: "s" },
        { type: "item" as const, id: "b", label: "Duplicar", onSelect: vi.fn() },
        {
            type: "item" as const,
            id: "c",
            label: "Excluir",
            danger: true,
            disabled: true,
            onSelect: vi.fn(),
        },
    ];

    it.each(["bottom-start", "bottom-end", "top-start", "top-end"] as const)(
        "carries the %s placement class",
        async (placement) => {
            render(
                <DropdownMenu
                    trigger={<button>abrir</button>}
                    items={items}
                    placement={placement}
                />,
            );
            await userEvent.click(screen.getByRole("button", { name: "abrir" }));
            const menu = screen.getByRole("menu");
            expect(menu.className).toBeTruthy();
        },
    );

    it("renders labels and separators as non-interactive entries", async () => {
        render(<DropdownMenu trigger={<button>abrir</button>} items={items} />);
        await userEvent.click(screen.getByRole("button", { name: "abrir" }));

        expect(screen.getByText("Ações")).toBeInTheDocument();
        // The separator is `aria-hidden`, so it is queried structurally.
        expect(screen.getByRole("menu").querySelectorAll('li[role="separator"]')).toHaveLength(1);
        expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    });

    it("skips disabled items while cycling with the arrow keys", async () => {
        render(<DropdownMenu trigger={<button>abrir</button>} items={items} />);
        await userEvent.click(screen.getByRole("button", { name: "abrir" }));

        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(document.activeElement?.textContent).toContain("Editar");

        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(document.activeElement?.textContent).toContain("Duplicar");

        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(document.activeElement?.textContent).toContain("Editar");
    });

    it("wraps backwards with ArrowUp", async () => {
        render(<DropdownMenu trigger={<button>abrir</button>} items={items} />);
        await userEvent.click(screen.getByRole("button", { name: "abrir" }));

        fireEvent.keyDown(window, { key: "ArrowUp" });
        expect(document.activeElement?.textContent).toContain("Editar");

        fireEvent.keyDown(window, { key: "ArrowUp" });
        expect(document.activeElement?.textContent).toContain("Duplicar");
    });

    it("closes on Escape and on an outside mousedown", async () => {
        render(<DropdownMenu trigger={<button>abrir</button>} items={items} />);
        const trigger = screen.getByRole("button", { name: "abrir" });

        await userEvent.click(trigger);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();

        await userEvent.click(trigger);
        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("keeps the menu open on a mousedown inside it", async () => {
        render(<DropdownMenu trigger={<button>abrir</button>} items={items} />);
        await userEvent.click(screen.getByRole("button", { name: "abrir" }));
        fireEvent.mouseDown(screen.getByRole("menu"));
        expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("ignores unrelated keys while open", async () => {
        render(<DropdownMenu trigger={<button>abrir</button>} items={items} />);
        await userEvent.click(screen.getByRole("button", { name: "abrir" }));
        fireEvent.keyDown(window, { key: "a" });
        expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("does not react to keys once closed", () => {
        render(<DropdownMenu trigger={<button>abrir</button>} items={items} />);
        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("closes after selecting an item and toggles off on a second trigger click", async () => {
        const onSelect = vi.fn();
        render(
            <DropdownMenu
                trigger={<button>abrir</button>}
                items={[{ type: "item", id: "x", label: "Ir", onSelect }]}
            />,
        );
        const trigger = screen.getByRole("button", { name: "abrir" });

        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole("menuitem", { name: "Ir" }));
        expect(onSelect).toHaveBeenCalled();
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();

        await userEvent.click(trigger);
        await userEvent.click(trigger);
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("renders an icon when the item carries one", async () => {
        render(
            <DropdownMenu
                trigger={<button>abrir</button>}
                items={[
                    { type: "item", id: "x", label: "Ir", icon: <span>→</span>, onSelect: vi.fn() },
                ]}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "abrir" }));
        expect(screen.getByText("→")).toBeInTheDocument();
    });

    it("survives a menu with no selectable items", async () => {
        render(
            <DropdownMenu
                trigger={<button>abrir</button>}
                items={[{ type: "label", id: "l", label: "Só título" }]}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "abrir" }));
        fireEvent.keyDown(window, { key: "ArrowDown" });
        fireEvent.keyDown(window, { key: "ArrowUp" });
        expect(screen.getByRole("menu")).toBeInTheDocument();
    });
});
