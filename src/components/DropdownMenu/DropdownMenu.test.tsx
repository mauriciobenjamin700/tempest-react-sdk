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
        render(
            <DropdownMenu
                trigger={<button type="button">menu</button>}
                items={[
                    { type: "item", id: "a", label: "Delete", danger: true, onSelect: vi.fn() },
                ]}
            />,
        );
        await userEvent.click(screen.getByText("menu"));
        expect(screen.getByRole("menuitem").className).toContain("danger");
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

    it.each([
        ["bottom-start", "bottomStart"],
        ["bottom-end", "bottomEnd"],
        ["top-start", "topStart"],
        ["top-end", "topEnd"],
    ] as const)("carries the %s placement class in flow", async (placement, className) => {
        render(
            <DropdownMenu
                trigger={<button>abrir</button>}
                items={items}
                placement={placement}
                portal={false}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "abrir" }));
        const menu = screen.getByRole("menu");
        expect(menu.className).toContain(className);
        expect(menu.className).not.toContain("portalled");
    });

    it("drops the placement class in a portal, where the anchor places the menu", async () => {
        render(<DropdownMenu trigger={<button>abrir</button>} items={items} placement="top-end" />);
        await userEvent.click(screen.getByRole("button", { name: "abrir" }));
        const menu = screen.getByRole("menu");
        expect(menu.className).toContain("portalled");
        expect(menu.className).not.toContain("topEnd");
    });

    it("renders labels and separators as non-interactive entries", async () => {
        render(<DropdownMenu trigger={<button>abrir</button>} items={items} />);
        await userEvent.click(screen.getByRole("button", { name: "abrir" }));

        expect(screen.getByText("Ações")).toBeInTheDocument();
        // The separator is `aria-hidden`, so it is queried structurally.
        expect(screen.getByRole("menu").querySelectorAll('li[role="separator"]')).toHaveLength(1);
        expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    });

    /*
     * These used to dispatch on `window`, which is why they passed while the
     * component was broken in a real application: firing the key at the window
     * skips the question of whether focus ever entered the menu, and it never
     * did. `userEvent.keyboard` sends the key to whatever holds focus, so the
     * assertions below fail against the old implementation.
     */
    it("skips disabled items while cycling with the arrow keys", async () => {
        render(<DropdownMenu trigger={<button>abrir</button>} items={items} />);
        await userEvent.click(screen.getByRole("button", { name: "abrir" }));
        expect(document.activeElement?.textContent).toContain("Editar");

        await userEvent.keyboard("{ArrowDown}");
        expect(document.activeElement?.textContent).toContain("Duplicar");

        await userEvent.keyboard("{ArrowDown}");
        expect(document.activeElement?.textContent).toContain("Editar");
    });

    it("wraps backwards with ArrowUp", async () => {
        render(<DropdownMenu trigger={<button>abrir</button>} items={items} />);
        await userEvent.click(screen.getByRole("button", { name: "abrir" }));

        await userEvent.keyboard("{ArrowUp}");
        expect(document.activeElement?.textContent).toContain("Duplicar");

        await userEvent.keyboard("{ArrowUp}");
        expect(document.activeElement?.textContent).toContain("Editar");
    });

    it("closes on Escape and on an outside mousedown", async () => {
        render(<DropdownMenu trigger={<button>abrir</button>} items={items} />);
        const trigger = screen.getByRole("button", { name: "abrir" });

        await userEvent.click(trigger);
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
        expect(document.activeElement).toBe(trigger);

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
        const menu = screen.getByRole("menu");
        for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
            fireEvent.keyDown(menu, { key });
        }
        expect(screen.getByRole("menu")).toBeInTheDocument();
        expect(document.activeElement).not.toBe(menu);
    });

    it("leaves the trigger alone when its own onKeyDown consumed the key", () => {
        render(
            <DropdownMenu
                trigger={<button onKeyDown={(event) => event.preventDefault()}>abrir</button>}
                items={items}
            />,
        );
        fireEvent.keyDown(screen.getByRole("button", { name: "abrir" }), { key: "ArrowDown" });
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("leaves the trigger alone when its own onClick consumed the click", async () => {
        render(
            <DropdownMenu
                trigger={<button onClick={(event) => event.preventDefault()}>abrir</button>}
                items={items}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "abrir" }));
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("opens on ArrowUp with the last selectable entry focused", async () => {
        render(<DropdownMenu trigger={<button>abrir</button>} items={items} />);
        fireEvent.keyDown(screen.getByRole("button", { name: "abrir" }), { key: "ArrowUp" });
        expect(await screen.findByRole("menu")).toBeInTheDocument();
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Duplicar" }));
    });
});
