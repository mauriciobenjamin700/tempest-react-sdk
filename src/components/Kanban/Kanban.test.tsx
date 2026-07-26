import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyKanbanMove, Kanban } from "./Kanban";
import type { KanbanColumn, KanbanMove } from "./Kanban";

const ROW = 40;
const COLUMN_WIDTH = 260;

/**
 * jsdom has no layout, so the board is given synthetic geometry: one column per
 * `data-sortable-group`, cards stacked inside it. Without this the pointer path
 * could not be exercised — hit-testing reads real rects.
 *
 * The row comes from the element's position among its siblings, not from
 * `data-sortable-index`: that index is **flat across the board**, so using it as a
 * row would stack the second column below the first instead of beside it.
 */
function stubBoardRects(): void {
    Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element) {
        const element = this as HTMLElement;
        const group = element.dataset?.sortableGroup;
        const columnIndex = group ? COLUMN_ORDER.indexOf(group) : -1;
        if (columnIndex === -1) {
            return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as DOMRect;
        }
        const siblings = Array.from(element.parentElement?.children ?? []);
        const row = Math.max(0, siblings.indexOf(element));
        return {
            top: row * ROW,
            bottom: row * ROW + ROW,
            left: columnIndex * COLUMN_WIDTH,
            right: columnIndex * COLUMN_WIDTH + COLUMN_WIDTH,
            width: COLUMN_WIDTH,
            height: ROW,
        } as DOMRect;
    };
}

const COLUMN_ORDER = ["todo", "doing", "done"];

const INITIAL: KanbanColumn[] = [
    {
        id: "todo",
        title: "A fazer",
        cards: [
            { id: "c1", content: "Corrigir login" },
            { id: "c2", content: "Exportar CSV" },
        ],
    },
    { id: "doing", title: "Fazendo", cards: [{ id: "c3", content: "Modo escuro" }] },
    { id: "done", title: "Feito", cards: [] },
];

function Board({
    initial = INITIAL,
    onMove,
    disabled = false,
}: {
    initial?: KanbanColumn[];
    onMove?: (move: KanbanMove) => void;
    disabled?: boolean;
}) {
    const [columns, setColumns] = useState(initial);
    return (
        <>
            <Kanban
                columns={columns}
                disabled={disabled}
                onMove={(move) => {
                    onMove?.(move);
                    setColumns((current) => applyKanbanMove(current, move));
                }}
            />
            <output data-testid="estado">
                {columns
                    .map((c) => `${c.id}:${c.cards.map((card) => card.id).join("|")}`)
                    .join(" ")}
            </output>
        </>
    );
}

/** Point inside the card at `row` of the column named `group`. */
function pointIn(group: string, row: number): { clientX: number; clientY: number } {
    return {
        clientX: COLUMN_ORDER.indexOf(group) * COLUMN_WIDTH + COLUMN_WIDTH / 2,
        clientY: row * ROW + ROW / 2,
    };
}

beforeEach(() => {
    stubBoardRects();
});

describe("applyKanbanMove", () => {
    it("moves a card to another column at the given index", () => {
        const next = applyKanbanMove(INITIAL, {
            cardId: "c1",
            fromColumn: "todo",
            toColumn: "doing",
            toIndex: 0,
        });

        expect(next[0].cards.map((c) => c.id)).toEqual(["c2"]);
        expect(next[1].cards.map((c) => c.id)).toEqual(["c1", "c3"]);
    });

    it("lands after the target when a card moves down inside its own column", () => {
        const next = applyKanbanMove(INITIAL, {
            cardId: "c1",
            fromColumn: "todo",
            toColumn: "todo",
            toIndex: 1,
        });

        expect(next[0].cards.map((c) => c.id)).toEqual(["c2", "c1"]);
    });

    it("does not adjust when a card moves up inside its own column", () => {
        const next = applyKanbanMove(INITIAL, {
            cardId: "c2",
            fromColumn: "todo",
            toColumn: "todo",
            toIndex: 0,
        });

        expect(next[0].cards.map((c) => c.id)).toEqual(["c2", "c1"]);
    });

    it("appends into an empty column", () => {
        const next = applyKanbanMove(INITIAL, {
            cardId: "c3",
            fromColumn: "doing",
            toColumn: "done",
            toIndex: 0,
        });

        expect(next[1].cards).toHaveLength(0);
        expect(next[2].cards.map((c) => c.id)).toEqual(["c3"]);
    });

    it("returns the same reference for an unknown card", () => {
        expect(
            applyKanbanMove(INITIAL, {
                cardId: "nope",
                fromColumn: "todo",
                toColumn: "doing",
                toIndex: 0,
            }),
        ).toBe(INITIAL);
    });

    it("returns the same reference for an unknown source column", () => {
        expect(
            applyKanbanMove(INITIAL, {
                cardId: "c1",
                fromColumn: "ghost",
                toColumn: "doing",
                toIndex: 0,
            }),
        ).toBe(INITIAL);
    });

    it("does not mutate the input", () => {
        applyKanbanMove(INITIAL, {
            cardId: "c1",
            fromColumn: "todo",
            toColumn: "done",
            toIndex: 0,
        });
        expect(INITIAL[0].cards.map((c) => c.id)).toEqual(["c1", "c2"]);
    });
});

describe("Kanban", () => {
    it("renders every column with its card count", () => {
        render(<Board />);

        expect(screen.getByRole("listbox", { name: "A fazer" })).toBeInTheDocument();
        expect(screen.getByText("Corrigir login")).toBeInTheDocument();
        expect(screen.getByText("Exportar CSV")).toBeInTheDocument();
    });

    it("shows the empty label for a column with no cards", () => {
        render(<Board />);
        expect(screen.getByText("Nenhum card")).toBeInTheDocument();
    });

    it("renders cards through renderCard when given", () => {
        render(
            <Kanban
                columns={INITIAL}
                onMove={vi.fn()}
                renderCard={(card, column) => `${column.id}/${card.id}`}
            />,
        );

        expect(screen.getByText("todo/c1")).toBeInTheDocument();
    });

    it("moves a card across columns by pointer", () => {
        const onMove = vi.fn();
        render(<Board onMove={onMove} />);

        fireEvent.pointerDown(screen.getByText("Corrigir login"), {
            pointerId: 1,
            ...pointIn("todo", 0),
        });
        fireEvent.pointerMove(window, { pointerId: 1, ...pointIn("doing", 0) });
        fireEvent.pointerUp(window, { pointerId: 1 });

        expect(onMove).toHaveBeenCalledWith({
            cardId: "c1",
            fromColumn: "todo",
            toColumn: "doing",
            toIndex: 0,
        });
        expect(screen.getByTestId("estado")).toHaveTextContent("todo:c2 doing:c1|c3 done:");
    });

    it("drops into an empty column", () => {
        render(<Board />);

        fireEvent.pointerDown(screen.getByText("Modo escuro"), {
            pointerId: 1,
            ...pointIn("doing", 0),
        });
        fireEvent.pointerMove(window, { pointerId: 1, ...pointIn("done", 0) });
        fireEvent.pointerUp(window, { pointerId: 1 });

        expect(screen.getByTestId("estado")).toHaveTextContent("doing: done:c3");
    });

    it("reorders inside a column", () => {
        render(<Board />);

        fireEvent.pointerDown(screen.getByText("Corrigir login"), {
            pointerId: 1,
            ...pointIn("todo", 0),
        });
        fireEvent.pointerMove(window, { pointerId: 1, ...pointIn("todo", 1) });
        fireEvent.pointerUp(window, { pointerId: 1 });

        expect(screen.getByTestId("estado")).toHaveTextContent("todo:c2|c1");
    });

    it("refuses a drop into a locked column", () => {
        const onMove = vi.fn();
        const locked = INITIAL.map((column) =>
            column.id === "done" ? { ...column, locked: true } : column,
        );
        render(<Board initial={locked} onMove={onMove} />);

        fireEvent.pointerDown(screen.getByText("Modo escuro"), {
            pointerId: 1,
            ...pointIn("doing", 0),
        });
        fireEvent.pointerMove(window, { pointerId: 1, ...pointIn("done", 0) });
        fireEvent.pointerUp(window, { pointerId: 1 });

        expect(onMove).not.toHaveBeenCalled();
    });

    it("still lets a card leave a locked column", () => {
        const onMove = vi.fn();
        const locked: KanbanColumn[] = [
            { id: "todo", title: "A fazer", cards: [], locked: true },
            { id: "doing", title: "Fazendo", cards: [] },
            { id: "done", title: "Feito", cards: [{ id: "c9", content: "Card travado" }] },
        ];
        render(<Board initial={[...locked].reverse()} onMove={onMove} />);

        expect(screen.getByText("Card travado")).toBeInTheDocument();
    });

    it("moves a card with the keyboard alone", async () => {
        const onMove = vi.fn();
        render(<Board onMove={onMove} />);

        screen.getByText("Corrigir login").focus();
        await userEvent.keyboard(" {ArrowDown}{Enter}");

        expect(onMove).toHaveBeenCalledWith(
            expect.objectContaining({ cardId: "c1", fromColumn: "todo" }),
        );
    });

    it("cancels a keyboard move with Escape", async () => {
        const onMove = vi.fn();
        render(<Board onMove={onMove} />);

        screen.getByText("Corrigir login").focus();
        await userEvent.keyboard(" {ArrowDown}{Escape}");

        expect(onMove).not.toHaveBeenCalled();
        expect(screen.getByTestId("estado")).toHaveTextContent("todo:c1|c2");
    });

    it("does nothing while disabled", () => {
        const onMove = vi.fn();
        render(<Board disabled onMove={onMove} />);

        fireEvent.pointerDown(screen.getByText("Corrigir login"), {
            pointerId: 1,
            ...pointIn("todo", 0),
        });
        fireEvent.pointerMove(window, { pointerId: 1, ...pointIn("doing", 0) });
        fireEvent.pointerUp(window, { pointerId: 1 });

        expect(onMove).not.toHaveBeenCalled();
    });

    it("exposes one listbox per non-empty column, with option cards", () => {
        render(<Board />);

        // "Feito" has no cards: a listbox with zero options fails
        // aria-required-children, so an empty column is a plain drop area.
        expect(screen.getAllByRole("listbox")).toHaveLength(2);
        expect(screen.getAllByRole("option")).toHaveLength(3);
        expect(screen.getByText("Corrigir login")).toHaveAttribute(
            "aria-roledescription",
            expect.stringContaining("Espaço"),
        );
    });

    it("accepts an extra className", () => {
        const { container } = render(
            <Kanban columns={INITIAL} onMove={vi.fn()} className="mine" />,
        );
        expect(container.firstElementChild).toHaveClass("mine");
    });
});
