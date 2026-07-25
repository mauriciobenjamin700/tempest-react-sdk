import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TreeView } from "./TreeView";
import type { TreeNode } from "./TreeView";

const nodes: TreeNode[] = [
    {
        id: "vendas",
        label: "Vendas",
        children: [
            { id: "vendas.ler", label: "Ler" },
            { id: "vendas.editar", label: "Editar" },
        ],
    },
    { id: "config", label: "Configurações", children: [] },
    { id: "sobre", label: "Sobre" },
];

function rowOf(name: string): HTMLElement {
    return screen.getByText(name).closest("[data-tree-id]") as HTMLElement;
}

describe("TreeView", () => {
    it("renders only the root rows when nothing is expanded", () => {
        render(<TreeView nodes={nodes} label="Permissões" />);

        expect(screen.getByRole("tree", { name: "Permissões" })).toBeInTheDocument();
        expect(screen.getAllByRole("treeitem")).toHaveLength(3);
        expect(screen.queryByText("Ler")).not.toBeInTheDocument();
    });

    it("reveals children of a node expanded by default", () => {
        render(<TreeView nodes={nodes} defaultExpandedIds={["vendas"]} />);
        expect(screen.getByText("Ler")).toBeInTheDocument();
    });

    it("marks branches with aria-expanded and leaves without it", () => {
        render(<TreeView nodes={nodes} />);

        expect(rowOf("Vendas").closest("li")).toHaveAttribute("aria-expanded", "false");
        expect(rowOf("Sobre").closest("li")).not.toHaveAttribute("aria-expanded");
    });

    it("treats an empty children array as a branch", () => {
        render(<TreeView nodes={nodes} />);
        expect(rowOf("Configurações").closest("li")).toHaveAttribute("aria-expanded", "false");
    });

    it("reports the depth through aria-level", () => {
        render(<TreeView nodes={nodes} defaultExpandedIds={["vendas"]} />);

        expect(rowOf("Vendas").closest("li")).toHaveAttribute("aria-level", "1");
        expect(rowOf("Ler").closest("li")).toHaveAttribute("aria-level", "2");
    });

    it("expands on click and reports the selection", async () => {
        const onSelect = vi.fn();
        render(<TreeView nodes={nodes} onSelect={onSelect} />);

        await userEvent.click(rowOf("Vendas"));

        expect(screen.getByText("Ler")).toBeInTheDocument();
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "vendas" }));
    });

    it("does not toggle on select when toggleOnSelect is false", async () => {
        render(<TreeView nodes={nodes} toggleOnSelect={false} />);

        await userEvent.click(rowOf("Vendas"));

        expect(screen.queryByText("Ler")).not.toBeInTheDocument();
        expect(rowOf("Vendas").closest("li")).toHaveAttribute("aria-selected", "true");
    });

    it("toggles from the chevron without selecting the row", async () => {
        const onSelect = vi.fn();
        render(<TreeView nodes={nodes} toggleOnSelect={false} onSelect={onSelect} />);

        const chevron = rowOf("Vendas").querySelector("span");
        await userEvent.click(chevron as HTMLElement);

        expect(screen.getByText("Ler")).toBeInTheDocument();
        expect(onSelect).not.toHaveBeenCalled();
    });

    it("ignores clicks on a disabled node", async () => {
        const onSelect = vi.fn();
        render(
            <TreeView
                nodes={[
                    {
                        id: "x",
                        label: "Bloqueado",
                        disabled: true,
                        children: [{ id: "y", label: "Filho" }],
                    },
                ]}
                onSelect={onSelect}
            />,
        );

        await userEvent.click(rowOf("Bloqueado"));

        expect(onSelect).not.toHaveBeenCalled();
        expect(screen.queryByText("Filho")).not.toBeInTheDocument();
    });

    it("respects a controlled expansion and reports changes", async () => {
        const onExpandedChange = vi.fn();
        render(<TreeView nodes={nodes} expandedIds={[]} onExpandedChange={onExpandedChange} />);

        await userEvent.click(rowOf("Vendas"));

        expect(onExpandedChange).toHaveBeenCalledWith(["vendas"]);
        expect(screen.queryByText("Ler")).not.toBeInTheDocument();
    });

    it("respects a controlled selection", async () => {
        const onSelect = vi.fn();
        render(<TreeView nodes={nodes} selectedId="sobre" onSelect={onSelect} />);

        expect(rowOf("Sobre").closest("li")).toHaveAttribute("aria-selected", "true");

        await userEvent.click(rowOf("Configurações"));

        expect(onSelect).toHaveBeenCalled();
        expect(rowOf("Sobre").closest("li")).toHaveAttribute("aria-selected", "true");
    });

    it("collapses an expanded node on a second click", async () => {
        render(<TreeView nodes={nodes} defaultExpandedIds={["vendas"]} />);

        await userEvent.click(rowOf("Vendas"));

        expect(screen.queryByText("Ler")).not.toBeInTheDocument();
    });

    it("keeps a single row tabbable (roving tabindex)", () => {
        render(<TreeView nodes={nodes} defaultExpandedIds={["vendas"]} />);

        const tabbable = screen
            .getAllByRole("treeitem")
            .map((item) => item.querySelector("[data-tree-id]"))
            .filter((row) => row?.getAttribute("tabindex") === "0");

        expect(tabbable).toHaveLength(1);
    });

    describe("keyboard", () => {
        it("moves down and up with the arrow keys", async () => {
            render(<TreeView nodes={nodes} />);
            rowOf("Vendas").focus();

            await userEvent.keyboard("{ArrowDown}");
            expect(rowOf("Configurações")).toHaveFocus();

            await userEvent.keyboard("{ArrowUp}");
            expect(rowOf("Vendas")).toHaveFocus();
        });

        it("expands with ArrowRight and descends on a second press", async () => {
            render(<TreeView nodes={nodes} />);
            rowOf("Vendas").focus();

            await userEvent.keyboard("{ArrowRight}");
            expect(screen.getByText("Ler")).toBeInTheDocument();

            await userEvent.keyboard("{ArrowRight}");
            expect(rowOf("Ler")).toHaveFocus();
        });

        it("collapses with ArrowLeft, then walks to the parent", async () => {
            render(<TreeView nodes={nodes} defaultExpandedIds={["vendas"]} />);
            rowOf("Ler").focus();

            await userEvent.keyboard("{ArrowLeft}");
            expect(rowOf("Vendas")).toHaveFocus();

            await userEvent.keyboard("{ArrowLeft}");
            expect(screen.queryByText("Ler")).not.toBeInTheDocument();
        });

        it("does nothing on ArrowLeft at a collapsed root", async () => {
            render(<TreeView nodes={nodes} />);
            rowOf("Sobre").focus();

            await userEvent.keyboard("{ArrowLeft}");

            expect(rowOf("Sobre")).toHaveFocus();
        });

        it("jumps to the first and last visible rows with Home and End", async () => {
            render(<TreeView nodes={nodes} defaultExpandedIds={["vendas"]} />);
            rowOf("Ler").focus();

            await userEvent.keyboard("{End}");
            expect(rowOf("Sobre")).toHaveFocus();

            await userEvent.keyboard("{Home}");
            expect(rowOf("Vendas")).toHaveFocus();
        });

        it("selects with Enter and with Space", async () => {
            const onSelect = vi.fn();
            render(<TreeView nodes={nodes} toggleOnSelect={false} onSelect={onSelect} />);

            rowOf("Sobre").focus();
            await userEvent.keyboard("{Enter}");
            await userEvent.keyboard(" ");

            expect(onSelect).toHaveBeenCalledTimes(2);
        });

        it("skips disabled rows while navigating", async () => {
            render(
                <TreeView
                    nodes={[
                        { id: "a", label: "A" },
                        { id: "b", label: "B", disabled: true },
                        { id: "c", label: "C" },
                    ]}
                />,
            );
            rowOf("A").focus();

            await userEvent.keyboard("{ArrowDown}");

            expect(rowOf("C")).toHaveFocus();
        });

        it("stays put when there is nowhere left to move", async () => {
            render(<TreeView nodes={[{ id: "only", label: "Only" }]} />);
            rowOf("Only").focus();

            await userEvent.keyboard("{ArrowDown}{ArrowUp}");

            expect(rowOf("Only")).toHaveFocus();
        });

        it("ignores unrelated keys", async () => {
            render(<TreeView nodes={nodes} />);
            rowOf("Vendas").focus();

            await userEvent.keyboard("x");

            expect(rowOf("Vendas")).toHaveFocus();
        });
    });

    it("renders a node icon", () => {
        render(<TreeView nodes={[{ id: "a", label: "A", icon: <span data-testid="ic" /> }]} />);
        expect(screen.getByTestId("ic")).toBeInTheDocument();
    });

    it("accepts an extra className", () => {
        render(<TreeView nodes={nodes} className="mine" />);
        expect(screen.getByRole("tree")).toHaveClass("mine");
    });
});
